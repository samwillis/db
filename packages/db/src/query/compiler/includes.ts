import { output, map } from "@electric-sql/d2mini"
import { compileQuery } from "./index.js"
import type { IncludeRef } from "../ir.js"
import type { KeyedStream, NamespacedAndKeyedStream } from "../../types.js"

function patchIRCollections(ir: any, collections: Record<string, any>) {
  if (ir && typeof ir === 'object') {
    if (ir.type === 'collectionRef' && ir.collection && ir.collection.id && collections[ir.collection.id]) {
      ir.collection = collections[ir.collection.id]
    }
    for (const key of Object.keys(ir)) {
      patchIRCollections(ir[key], collections)
    }
  }
}

/**
 * Helper function to extract a value from an object using a path array
 */
function getValueByPath(obj: any, path: string[]): any {
  let value = obj
  for (const segment of path) {
    if (value == null) return undefined
    value = value[segment]
  }
  return value
}

/**
 * Processes include subqueries and creates parallel D2 branches
 * This function is called by the live query collection sync function
 */
export function processIncludes(
  includeRefs: IncludeRef[],
  allInputs: Record<string, KeyedStream>,
  collections: Record<string, any>,
  mainPipeline?: NamespacedAndKeyedStream
): void {
  for (const includeRef of includeRefs) {
    patchIRCollections(includeRef.query, collections)
    console.log(`[INCLUDES] Subquery IR:`, JSON.stringify(includeRef.query, null, 2))
    
    // Determine the foreign key and local key paths
    let foreignKeyPath = includeRef.foreignKeyPath
    let localKeyPath = includeRef.localKeyPath

    // If not set, try to infer from the where clause
    if (
      (!foreignKeyPath || foreignKeyPath.length === 0) &&
      includeRef.query.where &&
      includeRef.query.where.length === 1
    ) {
      const where = includeRef.query.where[0]
      if (where && where.type === 'func' && where.name === 'eq' && where.args && where.args.length === 2) {
        const [left, right] = where.args
        if (left && left.type === 'ref' && right && right.type === 'ref' && 'path' in left && 'path' in right) {
          if (left.path[0] === includeRef.query.from.alias) {
            foreignKeyPath = left.path.slice(1)
            localKeyPath = right.path.slice(1)
          } else if (right.path[0] === includeRef.query.from.alias) {
            foreignKeyPath = right.path.slice(1)
            localKeyPath = left.path.slice(1)
          }
        }
      }
    }
    
    console.log(`[INCLUDES] Foreign key path:`, foreignKeyPath, 'Local key path:', localKeyPath)
    
    // Store the paths for later use
    ;(includeRef as any).__foreignKeyPath = foreignKeyPath
    ;(includeRef as any).__localKeyPath = localKeyPath
    
    // If we have a main pipeline, create a parallel include stream
    if (mainPipeline) {
      // Create a parallel D2 branch for the include subquery
      const includeStream = compileQuery(includeRef.query, allInputs)
      
      // Create a join between the main pipeline and the include stream
      // The join will match on the foreign key relationship
      mainPipeline.pipe(
        map(([key, namespacedRow]) => {
          // Extract the parent value from the namespaced row using the local key path
          let parentValue: any = undefined
          if (localKeyPath && localKeyPath.length > 0) {
            // The namespaced row is an array where the first element contains the actual data
            const data = Array.isArray(namespacedRow) ? namespacedRow[0] : namespacedRow
            if (data) {
              parentValue = getValueByPath(data, localKeyPath)
            }
          }
          
          console.log(`[INCLUDES] Namespaced row for key ${key}:`, JSON.stringify(namespacedRow, null, 2))
          console.log(`[INCLUDES] Parent value for key ${key}:`, parentValue, 'from path:', localKeyPath)
          
          // Return the parent value and key for joining
          return [key, { parentValue, namespacedRow }]
        })
      )
      
      // Process the include stream output to modify parent collections
      includeStream.pipe(
        output((message) => {
          const data = message.getInner()
          console.log(`[INCLUDES] Include stream message:`, data)
          
          for (const [[, childValue], multiplicity] of data) {
            // Extract the foreign key value from the child
            let foreignKeyValue = childValue
            for (const segment of foreignKeyPath || []) {
              if (foreignKeyValue == null) break
              foreignKeyValue = (foreignKeyValue as any)[segment]
            }
            
            console.log(`[INCLUDES] Child foreign key value:`, foreignKeyValue, 'multiplicity:', multiplicity)
            
            // Find the corresponding parent in the main pipeline
            // For now, we'll store this information to be processed later
            if (!(includeRef as any).__parentChildMappings) {
              ;(includeRef as any).__parentChildMappings = new Map()
            }
            
            const parentChildMappings = (includeRef as any).__parentChildMappings
            const key = String(foreignKeyValue)
            
            if (!parentChildMappings.has(key)) {
              parentChildMappings.set(key, [])
            }
            
            if (multiplicity > 0) {
              // Insert/update
              parentChildMappings.get(key)!.push({
                type: 'insert',
                childValue,
                multiplicity
              })
            } else if (multiplicity < 0) {
              // Delete
              parentChildMappings.get(key)!.push({
                type: 'delete',
                childValue,
                multiplicity: Math.abs(multiplicity)
              })
            }
          }
        })
      )
    }
    
    console.log(`[INCLUDES] Created include stream for ${includeRef.alias}`)
  }
}

/**
 * Extracts include references from a select clause
 */
export function extractIncludeRefs(select: Record<string, any>): IncludeRef[] {
  const includeRefs: IncludeRef[] = []
  
  for (const [, expression] of Object.entries(select)) {
    if (expression && typeof expression === 'object' && expression.type === 'includeRef') {
      includeRefs.push(expression as IncludeRef)
    }
  }
  
  return includeRefs
}