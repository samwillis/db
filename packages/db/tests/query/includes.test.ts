import { beforeEach, describe, expect, test } from "vitest"
import { createLiveQueryCollection, eq } from "../../src/query/index.js"
import { createCollection } from "../../src/collection.js"
import { mockSyncCollectionOptions } from "../utls.js"

// Sample types for includes testing
type Issue = {
  id: number
  title: string
  status: `open` | `in_progress` | `closed`
  projectId: number
  userId: number
  duration: number
  createdAt: string
}

type Comment = {
  id: number
  text: string
  issueId: number
  userId: number
  createdAt: string
}

type Project = {
  id: number
  name: string
  description: string
  createdAt: string
}

// Sample data
const sampleIssues: Array<Issue> = [
  {
    id: 1,
    title: `Bug 1`,
    status: `open`,
    projectId: 1,
    userId: 1,
    duration: 5,
    createdAt: `2024-01-01`,
  },
  {
    id: 2,
    title: `Bug 2`,
    status: `in_progress`,
    projectId: 1,
    userId: 2,
    duration: 8,
    createdAt: `2024-01-02`,
  },
  {
    id: 3,
    title: `Feature 1`,
    status: `closed`,
    projectId: 1,
    userId: 1,
    duration: 12,
    createdAt: `2024-01-03`,
  },
  {
    id: 4,
    title: `Bug 3`,
    status: `open`,
    projectId: 2,
    userId: 3,
    duration: 3,
    createdAt: `2024-01-04`,
  },
]

const sampleComments: Array<Comment> = [
  {
    id: 1,
    text: `This is a comment on issue 1`,
    issueId: 1,
    userId: 1,
    createdAt: `2024-01-01T10:00:00Z`,
  },
  {
    id: 2,
    text: `Another comment on issue 1`,
    issueId: 1,
    userId: 2,
    createdAt: `2024-01-01T11:00:00Z`,
  },
  {
    id: 3,
    text: `Comment on issue 2`,
    issueId: 2,
    userId: 1,
    createdAt: `2024-01-02T10:00:00Z`,
  },
  {
    id: 4,
    text: `Comment on issue 3`,
    issueId: 3,
    userId: 2,
    createdAt: `2024-01-03T10:00:00Z`,
  },
]

const sampleProjects: Array<Project> = [
  {
    id: 1,
    name: `Project Alpha`,
    description: `A test project`,
    createdAt: `2024-01-01`,
  },
  {
    id: 2,
    name: `Project Beta`,
    description: `Another test project`,
    createdAt: `2024-01-01`,
  },
]

function createIssuesCollection() {
  return createCollection(
    mockSyncCollectionOptions<Issue>({
      id: `includes-test-issues`,
      getKey: (issue) => issue.id,
      initialData: sampleIssues,
    })
  )
}

function createCommentsCollection() {
  return createCollection(
    mockSyncCollectionOptions<Comment>({
      id: `includes-test-comments`,
      getKey: (comment) => comment.id,
      initialData: sampleComments,
    })
  )
}

function createProjectsCollection() {
  return createCollection(
    mockSyncCollectionOptions<Project>({
      id: `includes-test-projects`,
      getKey: (project) => project.id,
      initialData: sampleProjects,
    })
  )
}

describe(`Includes`, () => {
  describe(`basic includes`, () => {
    let issuesCollection: ReturnType<typeof createIssuesCollection>
    let commentsCollection: ReturnType<typeof createCommentsCollection>

    beforeEach(() => {
      issuesCollection = createIssuesCollection()
      commentsCollection = createCommentsCollection()
    })

    test(`should create live query with includes`, () => {
      const liveCollection = createLiveQueryCollection({
        startSync: true,
        query: (q) =>
          q.from({ issue: issuesCollection }).select(({ issue }) => ({
            issue,
            comments: q
              .from({ comment: commentsCollection })
              .where(({ comment }) => eq(comment.issueId, issue.id)),
          })),
      })

      const results = liveCollection.toArray
      expect(results).toHaveLength(4)

      // Check that each issue has its comments
      const issue1 = results.find((r) => r.issue.id === 1)
      expect(issue1).toBeDefined()
      expect(issue1!.comments).toHaveLength(2)
      expect(issue1!.comments.map((c: any) => c.text)).toEqual(
        expect.arrayContaining([
          `This is a comment on issue 1`,
          `Another comment on issue 1`,
        ])
      )

      const issue2 = results.find((r) => r.issue.id === 2)
      expect(issue2).toBeDefined()
      expect(issue2!.comments).toHaveLength(1)
      expect(issue2!.comments[0].text).toBe(`Comment on issue 2`)

      const issue3 = results.find((r) => r.issue.id === 3)
      expect(issue3).toBeDefined()
      expect(issue3!.comments).toHaveLength(1)
      expect(issue3!.comments[0].text).toBe(`Comment on issue 3`)

      const issue4 = results.find((r) => r.issue.id === 4)
      expect(issue4).toBeDefined()
      expect(issue4!.comments).toHaveLength(0)
    })

    test(`should update includes when data changes`, () => {
      const liveCollection = createLiveQueryCollection({
        startSync: true,
        query: (q) =>
          q.from({ issue: issuesCollection }).select(({ issue }) => ({
            issue,
            comments: q
              .from({ comment: commentsCollection })
              .where(({ comment }) => eq(comment.issueId, issue.id)),
          })),
      })

      // Add a new comment to issue 1
      const newComment = {
        id: 5,
        text: `New comment on issue 1`,
        issueId: 1,
        userId: 1,
        createdAt: `2024-01-01T12:00:00Z`,
      }

      commentsCollection.utils.begin()
      commentsCollection.utils.write({
        type: `insert`,
        value: newComment,
      })
      commentsCollection.utils.commit()

      // Check that the new comment appears in the results
      const issue1 = liveCollection.toArray.find((r) => r.issue.id === 1)
      expect(issue1!.comments).toHaveLength(3)
      expect(issue1!.comments.map((c: any) => c.text)).toEqual(
        expect.arrayContaining([
          `This is a comment on issue 1`,
          `Another comment on issue 1`,
          `New comment on issue 1`,
        ])
      )
    })
  })

  describe(`nested includes`, () => {
    let issuesCollection: ReturnType<typeof createIssuesCollection>
    let commentsCollection: ReturnType<typeof createCommentsCollection>
    let projectsCollection: ReturnType<typeof createProjectsCollection>

    beforeEach(() => {
      issuesCollection = createIssuesCollection()
      commentsCollection = createCommentsCollection()
      projectsCollection = createProjectsCollection()
    })

    test(`should support multiple levels of includes`, () => {
      const liveCollection = createLiveQueryCollection({
        startSync: true,
        query: (q) =>
          q.from({ project: projectsCollection }).select(({ project }) => ({
            project,
            issues: q
              .from({ issue: issuesCollection })
              .where(({ issue }) => eq(issue.projectId, project.id))
              .select(({ issue }) => ({
                issue,
                comments: q
                  .from({ comment: commentsCollection })
                  .where(({ comment }) => eq(comment.issueId, issue.id)),
              })),
          })),
      })

      const results = liveCollection.toArray
      expect(results).toHaveLength(2)

      // Check Project Alpha (id: 1)
      const projectAlpha = results.find((r) => r.project.id === 1)
      expect(projectAlpha).toBeDefined()
      expect(projectAlpha!.issues).toHaveLength(3) // Issues 1, 2, 3

      // Check that issue 1 has its comments
      const issue1 = projectAlpha!.issues.find((i: any) => i.issue.id === 1)
      expect(issue1).toBeDefined()
      expect(issue1!.comments).toHaveLength(2)

      // Check Project Beta (id: 2)
      const projectBeta = results.find((r) => r.project.id === 2)
      expect(projectBeta).toBeDefined()
      expect(projectBeta!.issues).toHaveLength(1) // Issue 4

      const issue4 = projectBeta!.issues.find((i: any) => i.issue.id === 4)
      expect(issue4).toBeDefined()
      expect(issue4!.comments).toHaveLength(0)
    })
  })
})