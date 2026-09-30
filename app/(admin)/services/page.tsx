'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Edit2,
  Power,
  Package as PackageIcon,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
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
import type { Service, ServiceCategory, ServicePricingType, Package } from '@/lib/types'
import { OFFICIAL_CATEGORIES, seedOfficialCatalogue } from '@/lib/services/catalogueData'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isSyncing, setIsSyncing] = useState(false)

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
    pricingType: 'starting_from' as ServicePricingType,
    currency: 'GHS',
    status: 'active' as 'active' | 'inactive',
  })

  // Load Services and Packages
  useEffect(() => {
    setLoading(true)
    const unsubscribeServices = subscribeToCollection<Service>(
      COLLECTIONS.SERVICES,
      [],
      (data) => {
        setServices(data)
        setLoading(false)
      }
    )

    const unsubscribePackages = subscribeToCollection<Package>(
      COLLECTIONS.PACKAGES,
      [],
      (pkgs) => {
        setPackages(pkgs)
      }
    )

    return () => {
      unsubscribeServices()
      unsubscribePackages()
    }
  }, [])

  const handleSyncCatalogue = async () => {
    setIsSyncing(true)
    try {
      const res = await seedOfficialCatalogue()
      toast.success(
        `Catalogue synchronised: ${res.totalPackages} packages across ${OFFICIAL_CATEGORIES.length} official services.`
      )
    } catch (err) {
      console.error('Catalogue sync error:', err)
      toast.error('Failed to sync catalogue.')
    } finally {
      setIsSyncing(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Photography',
      customCategory: '',
      description: '',
      defaultPrice: 0,
      pricingType: 'starting_from',
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
    const isPreset = OFFICIAL_CATEGORIES.includes(service.category as string)
    setFormData({
      name: service.name || '',
      category: isPreset ? service.category : 'Other',
      customCategory: isPreset ? '' : service.category,
      description: service.description || '',
      defaultPrice: service.defaultPrice || 0,
      pricingType: service.pricingType || 'starting_from',
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
      const now = new Date().toISOString()
      if (editingService) {
        await updateDocument(COLLECTIONS.SERVICES, editingService.id, {
          name: formData.name.trim(),
          category: finalCategory,
          description: formData.description.trim(),
          defaultPrice: Number(formData.defaultPrice) || 0,
          pricingType: formData.pricingType,
          currency: formData.currency,
          status: formData.status,
          updatedAt: now,
        })
        toast.success('Service updated successfully.')
      } else {
        await addDocument(COLLECTIONS.SERVICES, {
          name: formData.name.trim(),
          category: finalCategory,
          description: formData.description.trim(),
          defaultPrice: Number(formData.defaultPrice) || 0,
          pricingType: formData.pricingType,
          currency: formData.currency,
          status: 'active',
          createdAt: now,
          updatedAt: now,
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
        updatedAt: new Date().toISOString(),
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
    new Set(['all', ...OFFICIAL_CATEGORIES, ...services.map((s) => s.category)])
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
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Services"
        subtitle="Manage services, set base prices, and configure pricing types."
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSyncCatalogue}
              variant="outline"
              size="md"
              loading={isSyncing}
              icon={<RefreshCw size={15} />}
            >
              Sync Official Catalogue
            </Button>
            <Button onClick={openAddModal} variant="primary" size="md" icon={<Plus size={16} />}>
              Add Service
            </Button>
          </div>
        }
      />

      {/* Controls & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search service name, category, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} className="text-gray-400" />}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <Filter size={14} />
            <span>Category:</span>
          </div>
          <select
            value={selectedCategory}
            onChange={(e: any) => setSelectedCategory(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none max-w-[220px]"
          >
            <option value="all">All Categories</option>
            {categoriesList
              .filter((c) => c !== 'all')
              .map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <Spinner size="lg" />
          <p className="text-xs text-gray-500">Loading services catalogue...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Wrench size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {search || selectedCategory !== 'all' ? 'No services match your search' : 'No services added yet'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {search || selectedCategory !== 'all'
                ? 'Try modifying your filter options or search term.'
                : 'Click Sync Official Catalogue to load the 8 canonical LEXMEDIA.GH service categories.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleSyncCatalogue} variant="outline" size="sm" icon={<RefreshCw size={14} />}>
              Sync Official Catalogue
            </Button>
            <Button onClick={openAddModal} variant="primary" size="sm" icon={<Plus size={14} />}>
              Add First Service
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map((service) => {
            const pkgsInService = packages.filter(
              (p) =>
                (p.category || p.serviceName || '').trim().toLowerCase() ===
                (service.name || service.category).trim().toLowerCase()
            )
            const activePkgs = pkgsInService.filter((p) => p.active !== false && p.status !== 'inactive')

            return (
              <div
                key={service.id}
                className={`bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-200 p-5 flex flex-col justify-between shadow-xs hover:shadow-md ${
                  service.status === 'inactive'
                    ? 'opacity-70 border-dashed border-gray-300 dark:border-gray-800'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/40">
                      {service.category}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        service.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                      }`}
                    >
                      {service.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {service.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {service.description || 'LEXMEDIA.GH official service catalogue item.'}
                    </p>
                  </div>

                  {/* Connected Packages pill */}
                  <div className="pt-2">
                    <Link
                      href="/packages"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <PackageIcon size={13} />
                      <span>{activePkgs.length} packages in catalogue</span>
                      <ExternalLink size={11} />
                    </Link>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-400">
                      {service.pricingType === 'starting_from'
                        ? 'Starting From'
                        : service.pricingType === 'custom'
                        ? 'Custom Quote'
                        : 'Base Price'}
                    </p>
                    <p className="text-lg font-extrabold text-gray-900 dark:text-gray-100 font-mono mt-0.5">
                      {service.pricingType === 'custom' || service.defaultPrice === 0
                        ? 'Varies by Package'
                        : formatCurrency(service.defaultPrice, service.currency || 'GHS')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(service)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      title="Edit Service"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeactivatingService(service)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        service.status === 'active'
                          ? 'text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                          : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                      }`}
                      title={service.status === 'active' ? 'Deactivate Service' : 'Activate Service'}
                    >
                      <Power size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Service Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingService ? 'Edit Service' : 'Add Service'}
        size="md"
      >
        <form onSubmit={handleSaveService} className="space-y-4">
          <Input
            label="Service Name *"
            placeholder="e.g. Website Design & Development"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
              >
                {OFFICIAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
            </div>

            {formData.category === 'Other' && (
              <Input
                label="Custom Category Name *"
                placeholder="e.g. Aerial Cinematography"
                value={formData.customCategory}
                onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                required
              />
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Pricing Structure
              </label>
              <select
                value={formData.pricingType}
                onChange={(e) =>
                  setFormData({ ...formData, pricingType: e.target.value as ServicePricingType })
                }
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
              >
                <option value="starting_from">Starting From</option>
                <option value="fixed">Fixed Price</option>
                <option value="custom">Custom Quote / Variable</option>
              </select>
            </div>
          </div>

          <Input
            label="Base Price (GH₵)"
            type="number"
            min="0"
            step="0.01"
            value={formData.defaultPrice}
            onChange={(e) => setFormData({ ...formData, defaultPrice: parseFloat(e.target.value) || 0 })}
          />

          <Textarea
            label="Service Scope / Description"
            placeholder="Brief overview of services provided..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formData.status === 'active'}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.checked ? 'active' : 'inactive' })
                }
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Service is active</span>
            </label>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                {editingService ? 'Save Changes' : 'Create Service'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Deactivate / Reactivate Modal */}
      <Modal
        isOpen={!!deactivatingService}
        onClose={() => setDeactivatingService(null)}
        title={deactivatingService?.status === 'active' ? 'Deactivate Service' : 'Activate Service'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Are you sure you want to{' '}
            {deactivatingService?.status === 'active' ? 'deactivate' : 'activate'}{' '}
            <strong>{deactivatingService?.name}</strong>?
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="ghost" size="sm" onClick={() => setDeactivatingService(null)}>
              Cancel
            </Button>
            <Button
              variant={deactivatingService?.status === 'active' ? 'danger' : 'primary'}
              size="sm"
              loading={isSubmitting}
              onClick={handleToggleStatus}
            >
              {deactivatingService?.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
