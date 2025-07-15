import { describe, expect, it } from "vitest"
import { CollectionImpl } from "../../../src/collection.js"
import { Query, getQueryIR } from "../../../src/query/builder/index.js"
import { eq } from "../../../src/query/builder/functions.js"

// Test schema
interface Employee {
  id: number
  name: string
  department_id: number
  salary: number
}

interface Department {
  id: number
  name: string
  budget: number
  location: string
}

// Test collections
const employeesCollection = new CollectionImpl<Employee>({
  id: `employees`,
  getKey: (item) => item.id,
  sync: { sync: () => {} },
})

const departmentsCollection = new CollectionImpl<Department>({
  id: `departments`,
  getKey: (item) => item.id,
  sync: { sync: () => {} },
})

describe(`QueryBuilder join aliases`, () => {
  it(`leftJoin should create a left join`, () => {
    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .leftJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )

    const builtQuery = getQueryIR(query)
    expect(builtQuery.join).toBeDefined()
    expect(builtQuery.join).toHaveLength(1)

    const join = builtQuery.join![0]!
    expect(join.type).toBe(`left`)
    expect(join.from.type).toBe(`collectionRef`)
    if (join.from.type === `collectionRef`) {
      expect(join.from.alias).toBe(`departments`)
      expect(join.from.collection).toBe(departmentsCollection)
    }
  })

  it(`rightJoin should create a right join`, () => {
    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .rightJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )

    const builtQuery = getQueryIR(query)
    expect(builtQuery.join).toBeDefined()
    expect(builtQuery.join).toHaveLength(1)

    const join = builtQuery.join![0]!
    expect(join.type).toBe(`right`)
    expect(join.from.type).toBe(`collectionRef`)
    if (join.from.type === `collectionRef`) {
      expect(join.from.alias).toBe(`departments`)
      expect(join.from.collection).toBe(departmentsCollection)
    }
  })

  it(`innerJoin should create an inner join`, () => {
    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .innerJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )

    const builtQuery = getQueryIR(query)
    expect(builtQuery.join).toBeDefined()
    expect(builtQuery.join).toHaveLength(1)

    const join = builtQuery.join![0]!
    expect(join.type).toBe(`inner`)
    expect(join.from.type).toBe(`collectionRef`)
    if (join.from.type === `collectionRef`) {
      expect(join.from.alias).toBe(`departments`)
      expect(join.from.collection).toBe(departmentsCollection)
    }
  })

  it(`fullJoin should create a full join`, () => {
    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .fullJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )

    const builtQuery = getQueryIR(query)
    expect(builtQuery.join).toBeDefined()
    expect(builtQuery.join).toHaveLength(1)

    const join = builtQuery.join![0]!
    expect(join.type).toBe(`full`)
    expect(join.from.type).toBe(`collectionRef`)
    if (join.from.type === `collectionRef`) {
      expect(join.from.alias).toBe(`departments`)
      expect(join.from.collection).toBe(departmentsCollection)
    }
  })

  it(`should support chaining different join types`, () => {
    const projectsCollection = new CollectionImpl<{
      id: number
      name: string
      department_id: number
    }>({
      id: `projects`,
      getKey: (item) => item.id,
      sync: { sync: () => {} },
    })

    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .leftJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )
      .rightJoin(
        { projects: projectsCollection },
        ({ departments, projects }) =>
          eq(departments.id, projects.department_id)
      )

    const builtQuery = getQueryIR(query)
    expect(builtQuery.join).toBeDefined()
    expect(builtQuery.join).toHaveLength(2)

    const firstJoin = builtQuery.join![0]!
    const secondJoin = builtQuery.join![1]!

    expect(firstJoin.type).toBe(`left`)
    expect(firstJoin.from.alias).toBe(`departments`)
    expect(secondJoin.type).toBe(`right`)
    expect(secondJoin.from.alias).toBe(`projects`)
  })

  it(`should allow accessing joined tables in select with proper types`, () => {
    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .leftJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )
      .select(({ employees, departments }) => ({
        id: employees.id,
        name: employees.name,
        department_name: departments.name,
        department_budget: departments.budget,
      }))

    const builtQuery = getQueryIR(query)
    expect(builtQuery.select).toBeDefined()
    expect(builtQuery.select).toHaveProperty(`id`)
    expect(builtQuery.select).toHaveProperty(`name`)
    expect(builtQuery.select).toHaveProperty(`department_name`)
    expect(builtQuery.select).toHaveProperty(`department_budget`)
  })

  it(`should support sub-queries in join aliases`, () => {
    const subQuery = new Query()
      .from({ departments: departmentsCollection })
      .select(({ departments }) => ({
        id: departments.id,
        name: departments.name,
      }))

    const builder = new Query()
    const query = builder
      .from({ employees: employeesCollection })
      .innerJoin({ bigDepts: subQuery as any }, ({ employees, bigDepts }) =>
        eq(employees.department_id, (bigDepts as any).id)
      )

    const builtQuery = getQueryIR(query)
    expect(builtQuery.join).toBeDefined()
    expect(builtQuery.join).toHaveLength(1)

    const join = builtQuery.join![0]!
    expect(join.type).toBe(`inner`)
    expect(join.from.alias).toBe(`bigDepts`)
    expect(join.from.type).toBe(`queryRef`)
  })
})
