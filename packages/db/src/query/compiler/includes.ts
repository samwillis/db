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
            localKeyPath = right.path // Use full path including parent alias
          } else if (right.path[0] === includeRef.query.from.alias) {
            foreignKeyPath = right.path.slice(1)
            localKeyPath = left.path // Use full path including parent alias
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
      
      console.log(`[INCLUDES] Created include stream for ${includeRef.alias}`)
      
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
            
            // Store the child value and multiplicity for later processing in the output
            if (!(includeRef as any).__childUpdates) {
              ;(includeRef as any).__childUpdates = new Map()
            }
            
            const childUpdates = (includeRef as any).__childUpdates
            const key = String(foreignKeyValue)
            
            if (!childUpdates.has(key)) {
              childUpdates.set(key, [])
            }
            
            if (multiplicity > 0) {
              // Insert/update
              childUpdates.get(key)!.push({
                type: 'insert',
                childValue,
                multiplicity
              })
            } else if (multiplicity < 0) {
              // Delete
              childUpdates.get(key)!.push({
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