// Plain-language messages for sign-in errors from Supabase.
export type LoginProblem = 'noAccess' | 'tooMany' | 'other'

export function loginProblem(message: string, status?: number): LoginProblem {
  const m = message.toLowerCase()
  if (m.includes('signup') || m.includes('sign up') || m.includes('not allowed') || m.includes('user not found')) return 'noAccess'
  if (status === 429 || m.includes('rate limit') || m.includes('security purposes')) return 'tooMany'
  return 'other'
}
