'use client'

import React, { useState, useEffect } from 'react'
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Edit2,
  Power,
  Tag,
  DollarSign,
  Calendar,
  AlertCircle,
  Layers,
  Sparkles,
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
import type { Service, ServiceCategory, ServicePricingType } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const PRESET_CATEGORIES: ServiceCategory[] = [
  'Photography',
  'Graphic Design',
  'Logo Design',
  'Brand Identity',
  'Flyer Design',
  'Video Production',
  'Video Editing',
  'Website Design',
  'Social Media Design',
  'Retouching',
  'Branding',
  'Other',
]

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deactivatingService, setDeactivatingService] = useState<Service | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Photography' as ServiceCategory | string,
    customCategory: '',
    description: '',
    defaultPrice: 0,
    pricingType: 'fixed' as ServicePricingType,
    currency: 'GHS',
    status: 'active' as 'active' | 'inactive',
  })

  // Load Services
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Service>(
      COLLECTIONS.SERVICES,
      [],
      (data) => {
        setServices(data)
        setLoading(false)
      }
    )

    getDocuments<Service>(COLLECTIONS.SERVICES).then((data) => {
      if (data && data.length > 0) setServices(data)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Photography',
      customCategory: '',
      description: '',
      defaultPrice: 0,
      pricingType: 'fixed',
      currency: 'GHS',
      status: 'active',
    })
    setEditingService(null)
  }

  const openAddModal = () => {
    resetForm()
    setIsAddModalOpen(true)
  }

  const openEditModal = (service: Service) => {
    setEditingService(service)
    const isPreset = PRESET_CATEGORIES.includes(service.category as ServiceCategory)
    setFormData({
      name: service.name || '',
      category: isPreset ? service.category : 'Other',
      customCategory: isPreset ? '' : service.category,
      description: service.description || '',
      defaultPrice: service.defaultPrice || 0,
      pricingType: service.pricingType || 'fixed',
      currency: service.currency || 'GHS',
      status: service.status === 'inactive' ? 'inactive' : 'active',
    })
    setIsAddModalOpen(true)
  }

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Please enter the service name')
      return
    }

    const finalCategory =
      formData.category === 'Other' && formData.customCategory.trim()
        ? formData.customCategory.trim()
        : formData.category

    setIsSubmitting(true)
    try {
      if (editingService) {
        await updateDocument(COLLECTIONS.SERVICES, editingService.id, {
          name: formData.name,
          category: finalCategory,
          description: formData.description,
          defaultPrice: Number(formData.defaultPrice) || 0,
          pricingType: formData.pricingType,
          currency: formData.currency,
          status: formData.status,
        })
        toast.success('Service updated successfully.')
      } else {
        await addDocument(COLLECTIONS.SERVICES, {
          name: formData.name,
          category: finalCategory,
          description: formData.description,
          defaultPrice: Number(formData.defaultPrice) || 0,
          pricingType: formData.pricingType,
          currency: formData.currency,
          status: 'active',
          createdBy: 'admin',
        })
        toast.success('Service added successfully.')
      }
      setIsAddModalOpen(false)
      resetForm()
    } catch (err) {
      console.error('Error saving service:', err)
      toast.error('Failed to save service.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!deactivatingService) return
    const newStatus = deactivatingService.status === 'active' ? 'inactive' : 'active'
    setIsSubmitting(true)
    try {
      await updateDocument(COLLECTIONS.SERVICES, deactivatingService.id, {
        status: newStatus,
      })
      toast.success(
        newStatus === 'inactive'
          ? 'Service deactivated successfully.'
          : 'Service activated successfully.'
      )
      setDeactivatingService(null)
    } catch (err) {
      console.error('Error toggling service status:', err)
      toast.error('Failed to update service status.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Categories present in services list
  const categoriesList = Array.from(
    new Set(['all', ...PRESET_CATEGORIES, ...services.map((s) => s.category)])
  )

  // Filtered Services
  const filteredServices = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()))

    const matchesCategory =
      selectedCategory === 'all' ? true : s.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Services"
        subtitle="Manage services offered by LexMedia, set base prices, and configure pricing types."
        action={
          <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
            Add Service
          </Button>
        }
      />

      {/* Controls & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search service name, category, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={18} className="text-gray-400" />}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>Category:</span>
          </div>
          <select
            value={selectedCategory}
            onChange={(e: any) => setSelectedCategory(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-accent-500 outline-none max-w-[200px]"
          >
            <option value="all">All Categories</option>
            {categoriesList.filter((c) => c !== 'all').map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-border">
          <Spinner size="lg" />
          <p className="text-sm text-muted">Loading services catalog...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center mx-auto mb-3">
            <Wrench size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {search || selectedCategory !== 'all' ? 'No services match your search' : 'No services added yet'}
          </h3>
          <p className="text-sm text-muted max-w-sm mx-auto mb-6">
            {search || selectedCategory !== 'all'
              ? 'Try modifying your filter options or search term.'
              : 'Add your individual service offerings so clients can request them.'}
          </p>
          {!search && selectedCategory === 'all' && (
            <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
              Add First Service
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className={`bg-white rounded-2xl border transition-all duration-200 p-6 flex flex-col justify-between shadow-card hover:shadow-modal ${
                service.status === 'inactive' ? 'opacity-70 border-dashed border-gray-300' : 'border-border'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="accent" size="sm">
                    {service.category}
                  </Badge>
                  <Badge
                    variant={service.status === 'active' ? 'success' : 'muted'}
                    size="sm"
                  >
                    {service.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-accent-600 transition-colors">
                    {service.name}
                  </h3>
                  <p className="text-xs text-muted mt-1 line-clamp-2">
                    {service.description || 'No service description provided.'}
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-gray-400">
                    {service.pricingType === 'starting_from'
                      ? 'Starting From'
                      : service.pricingType === 'custom'
                      ? 'Custom Quote'
                      : 'Fixed Price'}
                  </p>
                  <p className="text-xl font-extrabold text-gray-900 mt-0.5">
                    {service.pricingType === 'custom'
                      ? 'Custom'
                      : formatCurrency(service.defaultPrice)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(service)}
                    className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit Service"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => setDeactivatingService(service)}
                    className={`p-2 rounded-xl transition-colors ${
                      service.status === 'active'
                        ? 'text-gray-500 hover:text-danger-600 hover:bg-danger-50'
                        : 'text-gray-500 hover:text-success-600 hover:bg-success-50'
                    }`}
                    title={service.status === 'active' ? 'Deactivate Service' : 'Activate Service'}
                  >
                    <Power size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Service Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingService ? 'Edit Service' : 'Add New Service'}
        size="md"
      >
        <form onSubmit={handleSaveService} className="space-y-4">
          <Input
            label="Service Name *"
            placeholder="e.g. Executive Headshot Photography"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Category *</label>
              <select
                value={formData.category}
                onChange={(e: any) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              >
                {PRESET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Pricing Type *</label>
              <select
                value={formData.pricingType}
                onChange={(e: any) => setFormData({ ...formData, pricingType: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              >
                <option value="fixed">Fixed Price</option>
                <option value="starting_from">Starting From</option>
                <option value="custom">Custom Quote</option>
              </select>
            </div>
          </div>

          {formData.category === 'Other' && (
            <Input
              label="Custom Category Name *"
              placeholder="e.g. Motion Graphics"
              value={formData.customCategory}
              onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
              required
            />
          )}

          {formData.pricingType !== 'custom' && (
            <Input
              label="Base Price (GH₵) *"
              type="number"
              min="0"
              step="0.01"
              placeholder="500.00"
              value={formData.defaultPrice}
              onChange={(e) => setFormData({ ...formData, defaultPrice: Number(e.target.value) })}
              required
            />
          )}

          {editingService && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Status</label>
              <select
                value={formData.status}
                onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Service Description</label>
            <textarea
              rows={3}
              placeholder="Describe what this service covers..."
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
              {editingService ? 'Update Service' : 'Save Service'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Modal */}
      <Modal
        isOpen={!!deactivatingService}
        onClose={() => setDeactivatingService(null)}
        title={deactivatingService?.status === 'active' ? 'Deactivate Service' : 'Activate Service'}
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
            deactivatingService?.status === 'active' ? 'bg-danger-50 text-danger-600' : 'bg-success-50 text-success-600'
          }`}>
            <AlertCircle size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">
              {deactivatingService?.status === 'active'
                ? `Deactivate ${deactivatingService?.name}?`
                : `Re-activate ${deactivatingService?.name}?`}
            </h4>
            <p className="text-sm text-muted mt-1">
              {deactivatingService?.status === 'active'
                ? 'Deactivating this service will hide it from new project selections.'
                : 'Activating this service will make it available for new projects.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setDeactivatingService(null)}>
              Cancel
            </Button>
            <Button
              variant={deactivatingService?.status === 'active' ? 'danger' : 'primary'}
              onClick={handleToggleStatus}
              loading={isSubmitting}
            >
              {deactivatingService?.status === 'active' ? 'Deactivate Service' : 'Activate Service'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
