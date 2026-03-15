export interface User {
  id: number
  email: string
  name: string
  avatar_url: string
  role: 'owner' | 'coach' | 'student'
  is_superuser?: boolean
  date_joined: string
}
