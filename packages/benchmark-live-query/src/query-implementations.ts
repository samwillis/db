import { createCollection, createLiveQueryCollection, eq, count, sum, avg } from '@tanstack/db'
import type { 
  User, Comment, Issue, Department, QueryType, 
  GeneratedData 
} from './types.js'

export interface QueryImplementation {
  name: string
  execute: (data: GeneratedData) => Promise<{ result: any[], resultCount: number }>
  executeIncremental?: (
    data: GeneratedData,
    updates: ReturnType<typeof import('./data-generator.js').DataGenerator.prototype.generateIncrementalUpdates>
  ) => Promise<{ result: any[], resultCount: number }>
}

// Helper function to create a collection with initial data
function createCollectionWithData<T extends object>(
  id: string,
  getKey: (item: T) => string | number,
  initialData: T[]
) {
  const collection = createCollection({
    id,
    getKey: getKey as any,
    sync: {
      sync: ({ begin, write, commit }) => {
        // Immediately populate with initial data
        begin()
        for (const item of initialData) {
          write({
            type: 'insert',
            value: item as any
          })
        }
        commit()
        
        // Return cleanup function (no-op for static data)
        return () => {}
      }
    },
    startSync: true
  } as any)

  return collection as any
}

// Helper function to create collections for TanStack DB
function createCollectionsFromData(data: GeneratedData) {
  const usersCollection = createCollectionWithData(
    'users',
    (user: User) => user.id,
    data.users
  )

  const commentsCollection = createCollectionWithData(
    'comments', 
    (comment: Comment) => comment.id,
    data.comments
  )

  const issuesCollection = createCollectionWithData(
    'issues',
    (issue: Issue) => issue.id,
    data.issues
  )

  const departmentsCollection = createCollectionWithData(
    'departments',
    (dept: Department) => dept.id,
    data.departments
  )

  return { usersCollection, commentsCollection, issuesCollection, departmentsCollection }
}

// Basic single source with where clause and select
export const basicQueryImplementations: Record<string, QueryImplementation> = {
  'tanstack-db': {
    name: 'TanStack DB',
    execute: async (data) => {
      const { usersCollection } = createCollectionsFromData(data)
      
      // Wait for collection to be ready
      await usersCollection.preload()
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ user: usersCollection })
          .where(({ user }: any) => eq(user.active, true))
          .select(({ user }: any) => ({
            id: user.id,
            name: user.name,
            email: user.email
          }))
      })

      // Wait for live query to be ready
      await liveQuery.preload()
      
      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    },
    executeIncremental: async (data, updates) => {
      const { usersCollection } = createCollectionsFromData(data)
      
      // Wait for collection to be ready
      await usersCollection.preload()
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ user: usersCollection })
          .where(({ user }: any) => eq(user.active, true))
          .select(({ user }: any) => ({
            id: user.id,
            name: user.name,
            email: user.email
          }))
      })

      // Wait for live query to be ready
      await liveQuery.preload()

      // Apply incremental updates using transactions
      const { createTransaction } = await import('@tanstack/db')
      
      const tx = createTransaction({
        mutationFn: async () => {
          // No-op mutation function since we're just testing live query performance
        }
      })
      
      await tx.mutate(() => {
        for (const update of updates.userUpdates) {
          if (update.type === 'insert') {
            usersCollection.insert(update.value)
          } else if (update.type === 'update') {
            usersCollection.update(update.value.id, () => update.value)
          }
        }
      })

      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    }
  },

  'pure-js': {
    name: 'Pure JS',
    execute: async (data) => {
      const result = []
      for (const user of data.users) {
        if (user.active === true) {
          result.push({
            id: user.id,
            name: user.name,
            email: user.email
          })
        }
      }
      return { result, resultCount: result.length }
    }
  },

  'optimized-js': {
    name: 'Optimized JS',
    execute: async (data) => {
      const result = data.users
        .filter(user => user.active === true)
        .map(user => ({
          id: user.id,
          name: user.name,
          email: user.email
        }))
      return { result, resultCount: result.length }
    }
  }
}

// Simple query with order by and limit
export const basicWithOrderImplementations: Record<string, QueryImplementation> = {
  'tanstack-db': {
    name: 'TanStack DB',
    execute: async (data) => {
      const { usersCollection } = createCollectionsFromData(data)
      
      // Wait for collection to be ready
      await usersCollection.preload()
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ user: usersCollection })
          .where(({ user }: any) => eq(user.active, true))
          .select(({ user }: any) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            created_at: user.created_at
          }))
          .orderBy(({ user }: any) => user.created_at, 'desc')
          .limit(30)
      })

      // Wait for live query to be ready
      await liveQuery.preload()
      
      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    }
  },

  'pure-js': {
    name: 'Pure JS',
    execute: async (data) => {
      const filtered = []
      for (const user of data.users) {
        if (user.active === true) {
          filtered.push({
            id: user.id,
            name: user.name,
            email: user.email,
            created_at: user.created_at
          })
        }
      }
      
      // Manual sort by created_at descending
      for (let i = 0; i < filtered.length - 1; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          if (filtered[i].created_at < filtered[j].created_at) {
            const temp = filtered[i]
            filtered[i] = filtered[j]
            filtered[j] = temp
          }
        }
      }
      
      const result = filtered.slice(0, 30)
      return { result, resultCount: result.length }
    }
  },

  'optimized-js': {
    name: 'Optimized JS',
    execute: async (data) => {
      const result = data.users
        .filter(user => user.active === true)
        .map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          created_at: user.created_at
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30)
      
      return { result, resultCount: result.length }
    }
  }
}

// Simple left join - users on comments
export const simpleJoinImplementations: Record<string, QueryImplementation> = {
  'tanstack-db': {
    name: 'TanStack DB',
    execute: async (data) => {
      const { usersCollection, commentsCollection } = createCollectionsFromData(data)
      
      // Wait for collections to be ready
      await Promise.all([
        usersCollection.preload(),
        commentsCollection.preload()
      ])
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ comment: commentsCollection })
          .join(
            { user: usersCollection },
            ({ comment, user }: any) => eq(comment.user_id, user.id),
            'left'
          )
          .select(({ comment, user }: any) => ({
            comment_id: comment.id,
            content: comment.content,
            user_name: user.name,
            user_email: user.email
          }))
      })

      // Wait for live query to be ready
      await liveQuery.preload()
      
      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    }
  },

  'pure-js': {
    name: 'Pure JS',
    execute: async (data) => {
      const result = []
      for (const comment of data.comments) {
        let matchingUser = null
        for (const user of data.users) {
          if (user.id === comment.user_id) {
            matchingUser = user
            break
          }
        }
        
        result.push({
          comment_id: comment.id,
          content: comment.content,
          user_name: matchingUser?.name || null,
          user_email: matchingUser?.email || null
        })
      }
      return { result, resultCount: result.length }
    }
  },

  'optimized-js': {
    name: 'Optimized JS',
    execute: async (data) => {
      // Create a Map for O(1) user lookups
      const userMap = new Map<number, User>()
      for (const user of data.users) {
        userMap.set(user.id, user)
      }

      const result = data.comments.map(comment => {
        const user = userMap.get(comment.user_id)
        return {
          comment_id: comment.id,
          content: comment.content,
          user_name: user?.name || null,
          user_email: user?.email || null
        }
      })

      return { result, resultCount: result.length }
    }
  }
}

// Join with aggregate - comment counts on issues
export const joinWithAggregateImplementations: Record<string, QueryImplementation> = {
  'tanstack-db': {
    name: 'TanStack DB',
    execute: async (data) => {
      const { issuesCollection, commentsCollection } = createCollectionsFromData(data)
      
      // Wait for collections to be ready
      await Promise.all([
        issuesCollection.preload(),
        commentsCollection.preload()
      ])
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ issue: issuesCollection })
          .join(
            { comment: commentsCollection },
            ({ issue, comment }: any) => eq(issue.id, comment.issue_id),
            'left'
          )
          .groupBy(({ issue }: any) => [issue.id, issue.title, issue.status])
          .select(({ issue, comment }: any) => ({
            issue_id: issue.id,
            title: issue.title,
            status: issue.status,
            comment_count: count(comment.id)
          }))
      })

      // Wait for live query to be ready
      await liveQuery.preload()
      
      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    },
    executeIncremental: async (data, updates) => {
      const { issuesCollection, commentsCollection } = createCollectionsFromData(data)
      
      // Wait for collections to be ready
      await Promise.all([
        issuesCollection.preload(),
        commentsCollection.preload()
      ])
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ issue: issuesCollection })
          .join(
            { comment: commentsCollection },
            ({ issue, comment }: any) => eq(issue.id, comment.issue_id),
            'left'
          )
          .groupBy(({ issue }: any) => [issue.id, issue.title, issue.status])
          .select(({ issue, comment }: any) => ({
            issue_id: issue.id,
            title: issue.title,
            status: issue.status,
            comment_count: count(comment.id)
          }))
      })

      // Wait for live query to be ready
      await liveQuery.preload()

      // Apply incremental updates using transactions
      const { createTransaction } = await import('@tanstack/db')
      
      const tx = createTransaction({
        mutationFn: async () => {
          // No-op mutation function since we're just testing live query performance
        }
      })
      
      await tx.mutate(() => {
        // Apply comment updates (these will affect the aggregate counts)
        for (const update of updates.commentUpdates) {
          if (update.type === 'insert') {
            commentsCollection.insert(update.value)
          } else if (update.type === 'update') {
            commentsCollection.update(update.value.id, () => update.value)
          }
        }
        
        // Apply issue updates (these will affect the GROUP BY)
        for (const update of updates.issueUpdates) {
          if (update.type === 'insert') {
            issuesCollection.insert(update.value)
          } else if (update.type === 'update') {
            issuesCollection.update(update.value.id, () => update.value)
          }
        }
      })

      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    }
  },

  'pure-js': {
    name: 'Pure JS',
    execute: async (data) => {
      const result = []
      for (const issue of data.issues) {
        let commentCount = 0
        for (const comment of data.comments) {
          if (comment.issue_id === issue.id) {
            commentCount++
          }
        }
        
        result.push({
          issue_id: issue.id,
          title: issue.title,
          status: issue.status,
          comment_count: commentCount
        })
      }
      return { result, resultCount: result.length }
    }
  },

  'optimized-js': {
    name: 'Optimized JS',
    execute: async (data) => {
      // Create a Map to count comments per issue
      const commentCounts = new Map<number, number>()
      for (const comment of data.comments) {
        const currentCount = commentCounts.get(comment.issue_id) || 0
        commentCounts.set(comment.issue_id, currentCount + 1)
      }

      const result = data.issues.map(issue => ({
        issue_id: issue.id,
        title: issue.title,
        status: issue.status,
        comment_count: commentCounts.get(issue.id) || 0
      }))

      return { result, resultCount: result.length }
    }
  }
}

// Complex statistical aggregates
export const complexAggregateImplementations: Record<string, QueryImplementation> = {
  'tanstack-db': {
    name: 'TanStack DB',
    execute: async (data) => {
      const { usersCollection, departmentsCollection } = createCollectionsFromData(data)
      
      // Wait for collections to be ready
      await Promise.all([
        usersCollection.preload(),
        departmentsCollection.preload()
      ])
      
      const liveQuery = createLiveQueryCollection({
        startSync: true,
        query: (q: any) => q
          .from({ user: usersCollection })
          .join(
            { dept: departmentsCollection },
            ({ user, dept }: any) => eq(user.department_id, dept.id),
            'inner'
          )
          .groupBy(({ dept }: any) => [dept.id, dept.name])
          .select(({ user, dept }: any) => ({
            department_id: dept.id,
            department_name: dept.name,
            user_count: count(user.id),
            budget_per_user: avg(dept.budget), // This would be budget/user_count in real usage
            total_budget: sum(dept.budget)
          }))
      })

      // Wait for live query to be ready
      await liveQuery.preload()
      
      const result = liveQuery.toArray
      return { result, resultCount: result.length }
    }
  },

  'pure-js': {
    name: 'Pure JS',
    execute: async (data) => {
      const result = []
      for (const dept of data.departments) {
        let userCount = 0
        for (const user of data.users) {
          if (user.department_id === dept.id) {
            userCount++
          }
        }
        
        result.push({
          department_id: dept.id,
          department_name: dept.name,
          user_count: userCount,
          budget_per_user: userCount > 0 ? dept.budget / userCount : 0,
          total_budget: dept.budget
        })
      }
      return { result, resultCount: result.length }
    }
  },

  'optimized-js': {
    name: 'Optimized JS',
    execute: async (data) => {
      // Create a Map to count users per department
      const userCounts = new Map<number, number>()
      for (const user of data.users) {
        const currentCount = userCounts.get(user.department_id) || 0
        userCounts.set(user.department_id, currentCount + 1)
      }

      const result = data.departments.map(dept => {
        const userCount = userCounts.get(dept.id) || 0
        return {
          department_id: dept.id,
          department_name: dept.name,
          user_count: userCount,
          budget_per_user: userCount > 0 ? dept.budget / userCount : 0,
          total_budget: dept.budget
        }
      })

      return { result, resultCount: result.length }
    }
  }
}

// Export all implementations grouped by query type
export const allQueryImplementations: Record<QueryType, Record<string, QueryImplementation>> = {
  'basic': basicQueryImplementations,
  'basic-with-order': basicWithOrderImplementations,
  'simple-join': simpleJoinImplementations,
  'join-with-aggregate': joinWithAggregateImplementations,
  'complex-aggregate': complexAggregateImplementations
}