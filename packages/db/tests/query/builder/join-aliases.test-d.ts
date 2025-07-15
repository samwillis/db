import { describe, expectTypeOf, test } from "vitest"
import { CollectionImpl } from "../../../src/collection.js"
import { Query } from "../../../src/query/builder/index.js"
import { eq } from "../../../src/query/builder/functions.js"
import type { RefProxyFor } from "../../../src/query/builder/types.js"
import type { RefProxy } from "../../../src/query/builder/ref-proxy.js"

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

describe(`QueryBuilder join aliases type inference`, () => {
  test(`leftJoin should make joined table optional`, () => {
    const query = new Query()
      .from({ employees: employeesCollection })
      .leftJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )
      .select(({ employees, departments }) => ({
        // employees should be required
        employee_id: employees.id,
        employee_name: employees.name,
        // departments should be optional due to left join
        department_name: departments.name,
        department_budget: departments.budget,
      }))

    // Type check: departments properties should be optional
    expectTypeOf(query).toMatchTypeOf<{
      result: {
        employee_id: number
        employee_name: string
        department_name: string | undefined
        department_budget: number | undefined
      }
    }>()
  })

  test(`rightJoin should make main table optional`, () => {
    const query = new Query()
      .from({ employees: employeesCollection })
      .rightJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )
      .select(({ employees, departments }) => ({
        // employees should be optional due to right join
        employee_id: employees.id,
        employee_name: employees.name,
        // departments should be required
        department_name: departments.name,
        department_budget: departments.budget,
      }))

    // Type check: employees properties should be optional
    expectTypeOf(query).toMatchTypeOf<{
      result: {
        employee_id: number | undefined
        employee_name: string | undefined
        department_name: string
        department_budget: number
      }
    }>()
  })

  test(`innerJoin should make both tables required`, () => {
    const query = new Query()
      .from({ employees: employeesCollection })
      .innerJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )
      .select(({ employees, departments }) => ({
        // Both should be required due to inner join
        employee_id: employees.id,
        employee_name: employees.name,
        department_name: departments.name,
        department_budget: departments.budget,
      }))

    // Type check: both tables should be required
    expectTypeOf(query).toMatchTypeOf<{
      result: {
        employee_id: number
        employee_name: string
        department_name: string
        department_budget: number
      }
    }>()
  })

  test(`fullJoin should make both tables optional`, () => {
    const query = new Query()
      .from({ employees: employeesCollection })
      .fullJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) =>
          eq(employees.department_id, departments.id)
      )
      .select(({ employees, departments }) => ({
        // Both should be optional due to full join
        employee_id: employees.id,
        employee_name: employees.name,
        department_name: departments.name,
        department_budget: departments.budget,
      }))

    // Type check: both tables should be optional
    expectTypeOf(query).toMatchTypeOf<{
      result: {
        employee_id: number | undefined
        employee_name: string | undefined
        department_name: string | undefined
        department_budget: number | undefined
      }
    }>()
  })

  test(`should support chaining different join types with correct optionality`, () => {
    const projectsCollection = new CollectionImpl<{
      id: number
      name: string
      department_id: number
    }>({
      id: `projects`,
      getKey: (item) => item.id,
      sync: { sync: () => {} },
    })

    const query = new Query()
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
      .select(({ employees, departments, projects }) => ({
        // employees should be optional due to right join
        employee_id: employees.id,
        employee_name: employees.name,
        // departments should be optional due to left join
        department_name: departments.name,
        department_budget: departments.budget,
        // projects should be required due to right join
        project_name: projects.name,
      }))

    // Type check: verify optionality based on join types
    expectTypeOf(query).toMatchTypeOf<{
      result: {
        employee_id: number | undefined
        employee_name: string | undefined
        department_name: string | undefined
        department_budget: number | undefined
        project_name: string
      }
    }>()
  })

  test(`should have correct RefProxy types in join aliases`, () => {
    const query = new Query()
      .from({ employees: employeesCollection })
      .leftJoin(
        { departments: departmentsCollection },
        ({ employees, departments }) => {
          // Test that employees is required (main table)
          expectTypeOf(employees).toEqualTypeOf<RefProxyFor<Employee>>()
          expectTypeOf(employees.id).toEqualTypeOf<RefProxy<number>>()
          expectTypeOf(employees.name).toEqualTypeOf<RefProxy<string>>()

          // Test that departments is optional (left join)
          expectTypeOf(departments).toEqualTypeOf<
            RefProxyFor<Department | undefined>
          >()
          expectTypeOf(departments.id).toEqualTypeOf<
            RefProxy<number | undefined>
          >()
          expectTypeOf(departments.name).toEqualTypeOf<
            RefProxy<string | undefined>
          >()

          return eq(employees.department_id, departments.id)
        }
      )

    // Type check: verify the query has the correct structure
    expectTypeOf(query).toMatchTypeOf<{
      result: {
        employees: Employee
        departments: Department | undefined
      }
    }>()
  })
})
