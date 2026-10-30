import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const sessionCookie = cookies().get('__session')
  if (sessionCookie?.value) {
    redirect('/dashboard')
  }
  redirect('/login')
}
