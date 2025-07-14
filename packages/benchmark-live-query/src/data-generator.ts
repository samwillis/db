import type { User, Comment, Issue, Department } from './types.js'

export interface GeneratedData {
  users: User[]
  comments: Comment[]
  issues: Issue[]
  departments: Department[]
}

export class DataGenerator {
  private userNames = [
    'Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Eve Wilson',
    'Frank Miller', 'Grace Chen', 'Henry Davis', 'Ivy Rodriguez', 'Jack Thompson',
    'Kate Williams', 'Leo Martinez', 'Maya Patel', 'Noah Anderson', 'Olivia Taylor',
    'Paul Jones', 'Quinn Garcia', 'Rachel White', 'Sam Lee', 'Tina Clark',
    'Uma Singh', 'Victor Kim', 'Wendy Liu', 'Xavier Roy', 'Yuki Tanaka', 'Zoe Adams'
  ]

  private departments = [
    { name: 'Engineering', budget: 500000 },
    { name: 'Product', budget: 300000 },
    { name: 'Design', budget: 200000 },
    { name: 'Marketing', budget: 250000 },
    { name: 'Sales', budget: 400000 },
    { name: 'Support', budget: 150000 },
    { name: 'HR', budget: 100000 },
    { name: 'Finance', budget: 120000 }
  ]

  private issueStatuses: Array<'open' | 'in-progress' | 'closed'> = ['open', 'in-progress', 'closed']

  private commentTemplates = [
    'This looks good to me!',
    'I think we need to consider the performance implications here.',
    'Could you add some tests for this functionality?',
    'This is a great improvement, thanks for working on it.',
    'I noticed a potential issue with the edge case handling.',
    'The documentation could be updated to reflect these changes.',
    'This solves the problem we discussed in the meeting.',
    'I\'m not sure about this approach, let me think about it.',
    'Excellent work! This will help our users a lot.',
    'We should also consider backwards compatibility.',
    'The implementation looks solid, just a few minor suggestions.',
    'This is exactly what we needed, great job!',
    'I have some concerns about the security implications.',
    'The code looks clean and well-structured.',
    'We might want to add some error handling here.'
  ]

  private issueTitles = [
    'Fix login redirect issue',
    'Improve dashboard performance',
    'Add support for dark mode',
    'Implement user notifications',
    'Fix mobile responsiveness',
    'Add export functionality',
    'Optimize database queries',
    'Implement search filters',
    'Fix memory leak in component',
    'Add unit tests for API',
    'Improve error handling',
    'Add accessibility features',
    'Implement caching layer',
    'Fix cross-browser compatibility',
    'Add real-time updates',
    'Optimize image loading',
    'Implement user permissions',
    'Fix data validation',
    'Add integration tests',
    'Improve loading states'
  ]

  generate(recordCount: number): GeneratedData {
    const departmentCount = Math.min(this.departments.length, Math.max(3, Math.floor(recordCount / 1000)))
    const userCount = Math.floor(recordCount * 0.1) // 10% of records are users
    const issueCount = Math.floor(recordCount * 0.3) // 30% of records are issues
    const commentCount = recordCount - userCount - issueCount - departmentCount // Rest are comments

    const departments = this.generateDepartments(departmentCount)
    const users = this.generateUsers(userCount, departments)
    const issues = this.generateIssues(issueCount, users)
    const comments = this.generateComments(commentCount, users, issues)

    return { users, comments, issues, departments }
  }

  private generateDepartments(count: number): Department[] {
    return this.departments.slice(0, count).map((dept, index) => ({
      id: index + 1,
      name: dept.name,
      budget: dept.budget
    }))
  }

  private generateUsers(count: number, departments: Department[]): User[] {
    const users: User[] = []
    const startDate = new Date('2023-01-01')
    const endDate = new Date('2024-01-01')

    for (let i = 0; i < count; i++) {
      const randomName = this.userNames[Math.floor(Math.random() * this.userNames.length)]!
      const email = `${randomName.toLowerCase().replace(' ', '.')}@company.com`
      const createdAt = new Date(
        startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
      )

      users.push({
        id: i + 1,
        name: randomName,
        email,
        department_id: departments[Math.floor(Math.random() * departments.length)]!.id,
        active: Math.random() > 0.1, // 90% active users
        created_at: createdAt.toISOString()
      })
    }

    return users
  }

  private generateIssues(count: number, users: User[]): Issue[] {
    const issues: Issue[] = []
    const startDate = new Date('2023-01-01')
    const endDate = new Date('2024-01-01')

    for (let i = 0; i < count; i++) {
      const randomTitle = this.issueTitles[Math.floor(Math.random() * this.issueTitles.length)]!
      const status = this.issueStatuses[Math.floor(Math.random() * this.issueStatuses.length)]!
      const assignedUser = Math.random() > 0.2 ? users[Math.floor(Math.random() * users.length)] : null
      const createdAt = new Date(
        startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
      )

      issues.push({
        id: i + 1,
        title: `${randomTitle} #${i + 1}`,
        description: `This is the description for issue ${i + 1}. ${randomTitle} needs to be addressed.`,
        status,
        assigned_user_id: assignedUser?.id || null,
        created_at: createdAt.toISOString()
      })
    }

    return issues
  }

  private generateComments(count: number, users: User[], issues: Issue[]): Comment[] {
    const comments: Comment[] = []
    const startDate = new Date('2023-01-01')
    const endDate = new Date('2024-01-01')

    for (let i = 0; i < count; i++) {
      const randomContent = this.commentTemplates[Math.floor(Math.random() * this.commentTemplates.length)]!
      const user = users[Math.floor(Math.random() * users.length)]!
      const issue = issues[Math.floor(Math.random() * issues.length)]!
      const createdAt = new Date(
        startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
      )

      comments.push({
        id: i + 1,
        content: `${randomContent} (Comment ${i + 1})`,
        user_id: user.id,
        issue_id: issue.id,
        created_at: createdAt.toISOString()
      })
    }

    return comments
  }

  // Generate incremental updates for testing live query performance
  generateIncrementalUpdates(data: GeneratedData, updateCount: number): {
    userUpdates: Array<{ type: 'insert' | 'update' | 'delete', value: User }>
    commentUpdates: Array<{ type: 'insert' | 'update' | 'delete', value: Comment }>
    issueUpdates: Array<{ type: 'insert' | 'update' | 'delete', value: Issue }>
  } {
    const userUpdates: Array<{ type: 'insert' | 'update' | 'delete', value: User }> = []
    const commentUpdates: Array<{ type: 'insert' | 'update' | 'delete', value: Comment }> = []
    const issueUpdates: Array<{ type: 'insert' | 'update' | 'delete', value: Issue }> = []

    let nextUserId = Math.max(...data.users.map(u => u.id)) + 1
    let nextCommentId = Math.max(...data.comments.map(c => c.id)) + 1
    let nextIssueId = Math.max(...data.issues.map(i => i.id)) + 1

    for (let i = 0; i < updateCount; i++) {
      const updateType = Math.random()
      const entityType = Math.floor(Math.random() * 3)

      if (updateType < 0.6) { // 60% inserts
        if (entityType === 0) { // User insert
          const newUser: User = {
            id: nextUserId++,
            name: `New User ${nextUserId}`,
            email: `newuser${nextUserId}@company.com`,
            department_id: data.departments[Math.floor(Math.random() * data.departments.length)]!.id,
            active: true,
            created_at: new Date().toISOString()
          }
          userUpdates.push({ type: 'insert', value: newUser })
        } else if (entityType === 1) { // Comment insert
          const newComment: Comment = {
            id: nextCommentId++,
            content: `New comment ${nextCommentId}`,
            user_id: data.users[Math.floor(Math.random() * data.users.length)]!.id,
            issue_id: data.issues[Math.floor(Math.random() * data.issues.length)]!.id,
            created_at: new Date().toISOString()
          }
          commentUpdates.push({ type: 'insert', value: newComment })
        } else { // Issue insert
          const newIssue: Issue = {
            id: nextIssueId++,
            title: `New Issue ${nextIssueId}`,
            description: `This is a new issue ${nextIssueId}`,
            status: 'open',
            assigned_user_id: data.users[Math.floor(Math.random() * data.users.length)]!.id,
            created_at: new Date().toISOString()
          }
          issueUpdates.push({ type: 'insert', value: newIssue })
        }
      } else if (updateType < 0.9) { // 30% updates
        if (entityType === 0 && data.users.length > 0) { // User update
          const user = { ...data.users[Math.floor(Math.random() * data.users.length)]! }
          user.active = !user.active
          userUpdates.push({ type: 'update', value: user })
        } else if (entityType === 1 && data.comments.length > 0) { // Comment update
          const comment = { ...data.comments[Math.floor(Math.random() * data.comments.length)]! }
          comment.content = `Updated: ${comment.content}`
          commentUpdates.push({ type: 'update', value: comment })
        } else if (data.issues.length > 0) { // Issue update
          const issue = { ...data.issues[Math.floor(Math.random() * data.issues.length)]! }
          issue.status = this.issueStatuses[Math.floor(Math.random() * this.issueStatuses.length)]!
          issueUpdates.push({ type: 'update', value: issue })
        }
      } // 10% deletes would be handled here, but skipped for simplicity
    }

    return { userUpdates, commentUpdates, issueUpdates }
  }
}