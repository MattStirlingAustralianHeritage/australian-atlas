import AdminNavBar from '@/components/AdminNavBar'
import AdminSidebar from '@/components/AdminSidebar'
import './admin.css'

export default function AdminLayout({ children }) {
  return (
    <div className="admin-shell">
      <AdminSidebar />
      <div className="admin-main">
        <AdminNavBar />
        {children}
      </div>
    </div>
  )
}
