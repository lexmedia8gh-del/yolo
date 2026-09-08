'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FolderKanban,
  Search,
  Filter,
  Eye,
  ChevronRight,
  Calendar,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import {
  COLLECTIONS,
  getDocuments,
  deleteDocument,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type { Project, ProjectStatus } from '@/lib/types'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import toast from 'react-hot-toast'

const STATUS_OPTIONS: ProjectStatus[] = [
  'Inquiry',
  'Awaiting Payment',
  'Paid',
  'In Progress',
  'Review',
  'Revision',
  'Completed',
  'Cancelled',
]

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Project>(
      COLLECTIONS.PROJECTS,
      [],
      (data) => {
        setProjects(data)
        setLoading(false)
      }
    )

    getDocuments<Project>(COLLECTIONS.PROJECTS).then((data) => {
      if (data && data.length > 0) setProjects(data)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const handleDeleteProject = async () => {
    if (!deletingProject) return
    setIsSubmitting(true)
    try {
      await deleteDocument(COLLECTIONS.PROJECTS, deletingProject.id)
      toast.success('Project deleted successfully.')
      setDeletingProject(null)
    } catch (err) {
      console.error('Failed to delete project:', err)
      toast.error('Failed to delete project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (p.serviceName && p.serviceName.toLowerCase().includes(search.toLowerCase())) ||
      (p.packageTitle && p.packageTitle.toLowerCase().includes(search.toLowerCase()))

    const matchesStatus =
      statusFilter === 'all' ? true : p.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Projects"
        subtitle="Track all client projects, services, packages, and payment status."
      />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by project, client, service, or package…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} className="text-gray-400" />}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Filter size={14} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
          >
            <option value="all">All Projects</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2.5">
            <Spinner size="lg" />
            <p className="text-xs text-gray-500">Loading projects…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <FolderKanban size={20} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {search || statusFilter !== 'all' ? 'No projects match your filter' : 'No projects yet'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or status filter.'
                : 'Create a project by opening a client profile and clicking "+ New Project".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Service / Package</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filtered.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900 max-w-[180px] truncate">{project.name}</div>
                      {project.invoiceNumber && (
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{project.invoiceNumber}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/clients/${project.clientId}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {project.clientName}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-900 font-medium">{project.serviceName}</div>
                      {project.packageTitle && (
                        <div className="text-[11px] text-gray-500">{project.packageTitle}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {formatCurrency(project.price)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-600">
                      {formatCurrency(project.amountPaid || 0)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-rose-600">
                      {formatCurrency(project.outstandingBalance ?? project.price - (project.amountPaid || 0))}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-[11px] whitespace-nowrap">
                      {formatDate(project.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/projects/${project.id}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex"
                        title="View Project"
                      >
                        <Eye size={15} />
                      </Link>
                      <button
                        onClick={() => setDeletingProject(project)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors inline-flex ml-1"
                        title="Delete Project"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        title="Delete Project"
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-rose-50 text-rose-600">
            <Trash2 size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">
              Delete {deletingProject?.name}?
            </h4>
            <p className="text-sm text-gray-500 mt-1">
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setDeletingProject(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteProject}
              loading={isSubmitting}
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
