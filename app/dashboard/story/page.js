import { redirect } from 'next/navigation'

// "Your Story" was rolled into the Your Description workspace: the guided
// interview now lives at /dashboard/description, and everything written from
// it goes through the admin review queue before publishing.
export default function DashboardStory() {
  redirect('/dashboard/description')
}
