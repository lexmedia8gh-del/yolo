'use client'

import React, { useState, useEffect } from 'react'
import {
  Package as PackageIcon,
  Plus,
  Search,
  Filter,
  Edit2,
  Power,
  CheckCircle2,
  DollarSign,
  Tag,
  Calendar,
  AlertCircle,
  Layers,
  Sparkles,
  X,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  updateDocument,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type { Package, Service, PackageItem } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([])
  const [availableServices, setAvailableServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<Package | null>(null)
  const [deactivatingPackage, setDeactivatingPackage] = useState<Package | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: 0,
    discount: 0,
    currency: 'GHS',
    status: 'active' as 'active' | 'inactive',
    includedServices: [] as string[],
    whatsIncluded: [] as string[],
    newInclusionText: '',
  })

  // Load Packages and Services
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Package>(
      COLLECTIONS.PACKAGES,
      [],
      (data) => {
        setPackages(data)
        setLoading(false)
      }
    )

    getDocuments<Package>(COLLECTIONS.PACKAGES).then((data) => {
      if (data && data.length > 0) setPackages(data)
      setLoading(false)
    })

    getDocuments<Service>(COLLECTIONS.SERVICES).then((servs) => {
      setAvailableServices(servs)
    })

    return () => unsubscribe()
  }, [])

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      price: 0,
      discount: 0,
      currency: 'GHS',
      status: 'active',
      includedServices: [],
      whatsIncluded: [],
      newInclusionText: '',
    })
    setEditingPackage(null)
  }

  const openAddModal = () => {
    resetForm()
    setIsAddModalOpen(true)
  }

  const openEditModal = (pkg: Package) => {
    setEditingPackage(pkg)
    setFormData({
      title: pkg.title || '',
      description: pkg.description || '',
      price: pkg.price || 0,
      discount: pkg.discount || 0,
      currency: pkg.currency || 'GHS',
      status: pkg.status === 'inactive' ? 'inactive' : 'active',
      includedServices: pkg.includedServices || [],
      whatsIncluded: pkg.whatsIncluded ? pkg.whatsIncluded.map((i) => i.text) : [],
      newInclusionText: '',
    })
    setIsAddModalOpen(true)
  }

  const handleAddInclusion = () => {
    if (!formData.newInclusionText.trim()) return
    setFormData({
      ...formData,
      whatsIncluded: [...formData.whatsIncluded, formData.newInclusionText.trim()],
      newInclusionText: '',
    })
  }

  const handleRemoveInclusion = (index: number) => {
    const updated = [...formData.whatsIncluded]
    updated.splice(index, 1)
    setFormData({ ...formData, whatsIncluded: updated })
  }

  const handleToggleServiceSelection = (serviceName: string) => {
    const exists = formData.includedServices.includes(serviceName)
    if (exists) {
      setFormData({
        ...formData,
        includedServices: formData.includedServices.filter((s) => s !== serviceName),
      })
    } else {
      setFormData({
        ...formData,
        includedServices: [...formData.includedServices, serviceName],
      })
    }
  }

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      toast.error('Please enter the package title')
      return
    }

    const whatsIncludedItems: PackageItem[] = formData.whatsIncluded.map((text, idx) => ({
      id: `item_${idx}_${Date.now()}`,
      text,
    }))

    setIsSubmitting(true)
    try {
      if (editingPackage) {
        await updateDocument(COLLECTIONS.PACKAGES, editingPackage.id, {
          title: formData.title,
          description: formData.description,
          price: Number(formData.price) || 0,
          discount: Number(formData.discount) || 0,
          currency: formData.currency,
          status: formData.status,
          includedServices: formData.includedServices,
          whatsIncluded: whatsIncludedItems,
        })
        toast.success('Package updated successfully.')
      } else {
        await addDocument(COLLECTIONS.PACKAGES, {
          title: formData.title,
          description: formData.description,
          price: Number(formData.price) || 0,
          discount: Number(formData.discount) || 0,
          currency: formData.currency,
          status: 'active',
          includedServices: formData.includedServices,
          whatsIncluded: whatsIncludedItems,
          createdBy: 'admin',
        })
        toast.success('Package created successfully.')
      }
      setIsAddModalOpen(false)
      resetForm()
    } catch (err) {
      console.error('Error saving package:', err)
      toast.error('Failed to save package.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!deactivatingPackage) return
    const newStatus = deactivatingPackage.status === 'active' ? 'inactive' : 'active'
    setIsSubmitting(true)
    try {
      await updateDocument(COLLECTIONS.PACKAGES, deactivatingPackage.id, {
        status: newStatus,
      })
      toast.success(
        newStatus === 'inactive'
          ? 'Package deactivated successfully.'
          : 'Package activated successfully.'
      )
      setDeactivatingPackage(null)
    } catch (err) {
      console.error('Error toggling package status:', err)
      toast.error('Failed to update package status.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtered Packages
  const filteredPackages = packages.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()))

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? p.status === 'active'
        : p.status === 'inactive'

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Packages"
        subtitle="Combine multiple services into ready-to-sell packages for your clients."
        action={
          <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
            Create Package
          </Button>
        }
      />

      {/* Controls & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search package title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={18} className="text-gray-400" />}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-accent-500 outline-none"
          >
            <option value="all">All Packages</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Package Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-border">
          <Spinner size="lg" />
          <p className="text-sm text-muted">Loading service packages...</p>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center mx-auto mb-3">
            <PackageIcon size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {search || statusFilter !== 'all' ? 'No packages match your search' : 'No packages created yet'}
          </h3>
          <p className="text-sm text-muted max-w-sm mx-auto mb-6">
            {search || statusFilter !== 'all'
              ? 'Try modifying your search or status filter options.'
              : 'Bundle your services into attractive packages to sell more effectively.'}
          </p>
          {!search && statusFilter === 'all' && (
            <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
              Create First Package
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((pkg) => {
            const finalPrice = pkg.discount && pkg.discount > 0 ? pkg.price - pkg.discount : pkg.price
            return (
              <div
                key={pkg.id}
                className={`bg-white rounded-2xl border transition-all duration-200 p-6 flex flex-col justify-between shadow-card hover:shadow-modal ${
                  pkg.status === 'inactive' ? 'opacity-70 border-dashed border-gray-300' : 'border-border'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant={pkg.status === 'active' ? 'success' : 'muted'}
                      size="sm"
                    >
                      {pkg.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                    {pkg.discount && pkg.discount > 0 ? (
                      <span className="bg-danger-50 text-danger-600 text-[11px] font-bold px-2 py-0.5 rounded-full border border-danger-100">
                        SAVE {formatCurrency(pkg.discount)}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{pkg.title}</h3>
                    <p className="text-xs text-muted mt-1 line-clamp-2">
                      {pkg.description || 'No package description provided.'}
                    </p>
                  </div>

                  {/* Included Services Tags */}
                  {pkg.includedServices && pkg.includedServices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {pkg.includedServices.map((serviceName, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[11px] font-medium px-2.5 py-1 rounded-lg"
                        >
                          <Layers size={10} className="text-accent-600" />
                          {serviceName}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Features List */}
                  {pkg.whatsIncluded && pkg.whatsIncluded.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">What's Included</p>
                      <ul className="space-y-1.5">
                        {pkg.whatsIncluded.map((item) => (
                          <li key={item.id} className="flex items-start gap-2 text-xs text-gray-700">
                            <CheckCircle2 size={14} className="text-success-600 mt-0.5 shrink-0" />
                            <span>{item.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="pt-6 mt-6 border-t border-border flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-400">Package Price</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-2xl font-extrabold text-gray-900">
                        {formatCurrency(finalPrice)}
                      </p>
                      {pkg.discount && pkg.discount > 0 ? (
                        <span className="text-xs text-muted line-through font-medium">
                          {formatCurrency(pkg.price)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(pkg)}
                      className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit Package"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeactivatingPackage(pkg)}
                      className={`p-2 rounded-xl transition-colors ${
                        pkg.status === 'active'
                          ? 'text-gray-500 hover:text-danger-600 hover:bg-danger-50'
                          : 'text-gray-500 hover:text-success-600 hover:bg-success-50'
                      }`}
                      title={pkg.status === 'active' ? 'Deactivate Package' : 'Activate Package'}
                    >
                      <Power size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Package Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingPackage ? 'Edit Package' : 'Create New Package'}
        size="lg"
      >
        <form onSubmit={handleSavePackage} className="space-y-5">
          <Input
            label="Package Title *"
            placeholder="e.g. Premium Branding & Photography Package"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Package Price (GH₵) *"
              type="number"
              min="0"
              step="0.01"
              placeholder="1500.00"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
              required
            />
            <Input
              label="Discount Amount (Optional GH₵)"
              type="number"
              min="0"
              step="0.01"
              placeholder="200.00"
              value={formData.discount}
              onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) })}
            />
          </div>

          {/* Select Included Services */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">Select Included Services</label>
            {availableServices.length === 0 ? (
              <p className="text-xs text-muted italic">
                No services defined yet. You can type custom items below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-border max-h-36 overflow-y-auto">
                {availableServices.map((s) => {
                  const selected = formData.includedServices.includes(s.name)
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => handleToggleServiceSelection(s.name)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                        selected
                          ? 'bg-accent-600 text-white border-accent-600 shadow-sm'
                          : 'bg-white text-gray-700 border-border hover:bg-gray-100'
                      }`}
                    >
                      {selected ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                      {s.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Add Included Deliverables / Bullet points */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">Included Deliverables & Features</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 2-hour photo session, 20 retouched images..."
                value={formData.newInclusionText}
                onChange={(e) => setFormData({ ...formData, newInclusionText: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddInclusion()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddInclusion}>
                Add
              </Button>
            </div>

            {/* List of Deliverables */}
            {formData.whatsIncluded.length > 0 && (
              <ul className="space-y-1.5 pt-2">
                {formData.whatsIncluded.map((text, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl text-xs text-gray-700 border border-border"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-success-600 shrink-0" />
                      {text}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveInclusion(idx)}
                      className="text-gray-400 hover:text-danger-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Package Description</label>
            <textarea
              rows={3}
              placeholder="Describe the package benefits for your clients..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {editingPackage ? 'Update Package' : 'Save Package'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={!!deactivatingPackage}
        onClose={() => setDeactivatingPackage(null)}
        title={deactivatingPackage?.status === 'active' ? 'Deactivate Package' : 'Activate Package'}
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
            deactivatingPackage?.status === 'active' ? 'bg-danger-50 text-danger-600' : 'bg-success-50 text-success-600'
          }`}>
            <AlertCircle size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">
              {deactivatingPackage?.status === 'active'
                ? `Deactivate ${deactivatingPackage?.title}?`
                : `Re-activate ${deactivatingPackage?.title}?`}
            </h4>
            <p className="text-sm text-muted mt-1">
              {deactivatingPackage?.status === 'active'
                ? 'Deactivating this package will hide it from new invoice offers.'
                : 'Activating this package will make it available for new invoices.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setDeactivatingPackage(null)}>
              Cancel
            </Button>
            <Button
              variant={deactivatingPackage?.status === 'active' ? 'danger' : 'primary'}
              onClick={handleToggleStatus}
              loading={isSubmitting}
            >
              {deactivatingPackage?.status === 'active' ? 'Deactivate Package' : 'Activate Package'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
