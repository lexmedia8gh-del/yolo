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
  Tag,
  AlertCircle,
  Layers,
  Sparkles,
  X,
  Trash2,
  Copy,
  RefreshCw,
  PlusCircle,
  HelpCircle,
  ShieldAlert,
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
  deleteDocument,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type {
  Package,
  Service,
  PackageItem,
  AddOn,
  PackagePricingType,
  PackageDepositType,
} from '@/lib/types'
import {
  OFFICIAL_CATEGORIES,
  seedOfficialCatalogue,
} from '@/lib/services/catalogueData'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function PackagesPage() {
  const [activeTab, setActiveTab] = useState<'packages' | 'addons'>('packages')
  const [packages, setPackages] = useState<Package[]>([])
  const [addOns, setAddOns] = useState<AddOn[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [isSyncing, setIsSyncing] = useState(false)

  // Package Modal States
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<Package | null>(null)
  const [deactivatingPackage, setDeactivatingPackage] = useState<Package | null>(null)
  const [deletingPackage, setDeletingPackage] = useState<Package | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // AddOn Modal States
  const [isAddOnModalOpen, setIsAddOnModalOpen] = useState(false)
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null)
  const [deletingAddOn, setDeletingAddOn] = useState<AddOn | null>(null)

  // Package Form State
  const [packageForm, setPackageForm] = useState({
    title: '',
    category: 'Photography',
    customCategory: '',
    description: '',
    price: 0,
    pricingType: 'fixed' as PackagePricingType,
    depositType: 'percentage' as PackageDepositType,
    depositValue: 50,
    currency: 'GHS',
    active: true,
    inclusions: [] as string[],
    newInclusionText: '',
  })

  // Add-on Form State
  const [addOnForm, setAddOnForm] = useState({
    name: '',
    category: 'General',
    price: 0,
    pricingType: 'fixed' as 'fixed' | 'starting_from',
    description: '',
    active: true,
  })

  // Real-time Subscriptions
  useEffect(() => {
    setLoading(true)

    const unsubPackages = subscribeToCollection<Package>(
      COLLECTIONS.PACKAGES,
      [],
      (data) => {
        setPackages(data)
        setLoading(false)
      }
    )

    const unsubAddOns = subscribeToCollection<AddOn>(
      COLLECTIONS.ADD_ONS,
      [],
      (data) => {
        setAddOns(data)
      }
    )

    getDocuments<Service>(COLLECTIONS.SERVICES).then((servs) => {
      setServices(servs)
    })

    return () => {
      unsubPackages()
      unsubAddOns()
    }
  }, [])

  // Auto-seed on first empty state check
  useEffect(() => {
    if (!loading && packages.length === 0) {
      handleSyncCatalogue(false)
    }
  }, [loading, packages.length])

  // Sync Official Catalogue
  const handleSyncCatalogue = async (showSuccessToast = true) => {
    setIsSyncing(true)
    try {
      const res = await seedOfficialCatalogue()
      if (showSuccessToast) {
        toast.success(
          `Catalogue synchronised: ${res.totalPackages} packages and ${res.totalAddOns} add-ons ready.`
        )
      }
    } catch (err: any) {
      console.error('Catalogue sync error:', err)
      toast.error('Failed to synchronise catalogue.')
    } finally {
      setIsSyncing(false)
    }
  }

  // --- Package Form Handlers ---
  const resetPackageForm = () => {
    setPackageForm({
      title: '',
      category: 'Photography',
      customCategory: '',
      description: '',
      price: 0,
      pricingType: 'fixed',
      depositType: 'percentage',
      depositValue: 50,
      currency: 'GHS',
      active: true,
      inclusions: [],
      newInclusionText: '',
    })
    setEditingPackage(null)
  }

  const openAddPackageModal = () => {
    resetPackageForm()
    if (selectedCategory !== 'all') {
      setPackageForm((prev) => ({ ...prev, category: selectedCategory }))
    }
    setIsPackageModalOpen(true)
  }

  const openEditPackageModal = (pkg: Package) => {
    setEditingPackage(pkg)
    const category = pkg.category || pkg.serviceName || 'Photography'
    const isPresetCat = OFFICIAL_CATEGORIES.includes(category)

    const inclusions =
      pkg.inclusions && pkg.inclusions.length > 0
        ? pkg.inclusions
        : pkg.whatsIncluded
        ? pkg.whatsIncluded.map((i) => i.text)
        : []

    setPackageForm({
      title: pkg.title || pkg.name || '',
      category: isPresetCat ? category : 'Other',
      customCategory: isPresetCat ? '' : category,
      description: pkg.description || '',
      price: pkg.price || 0,
      pricingType: pkg.pricingType || 'fixed',
      depositType: pkg.depositType || 'percentage',
      depositValue: pkg.depositValue ?? 50,
      currency: pkg.currency || 'GHS',
      active: pkg.active !== undefined ? pkg.active : pkg.status !== 'inactive',
      inclusions,
      newInclusionText: '',
    })
    setIsPackageModalOpen(true)
  }

  const handleDuplicatePackage = (pkg: Package) => {
    setEditingPackage(null)
    const category = pkg.category || pkg.serviceName || 'Photography'
    const isPresetCat = OFFICIAL_CATEGORIES.includes(category)
    const inclusions =
      pkg.inclusions && pkg.inclusions.length > 0
        ? pkg.inclusions
        : pkg.whatsIncluded
        ? pkg.whatsIncluded.map((i) => i.text)
        : []

    setPackageForm({
      title: `${pkg.title || pkg.name} (Copy)`,
      category: isPresetCat ? category : 'Other',
      customCategory: isPresetCat ? '' : category,
      description: pkg.description || '',
      price: pkg.price || 0,
      pricingType: pkg.pricingType || 'fixed',
      depositType: pkg.depositType || 'percentage',
      depositValue: pkg.depositValue ?? 50,
      currency: pkg.currency || 'GHS',
      active: true,
      inclusions: [...inclusions],
      newInclusionText: '',
    })
    setIsPackageModalOpen(true)
    toast('Customising duplicated package.', { icon: '📋' })
  }

  const handleAddInclusion = () => {
    if (!packageForm.newInclusionText.trim()) return
    setPackageForm({
      ...packageForm,
      inclusions: [...packageForm.inclusions, packageForm.newInclusionText.trim()],
      newInclusionText: '',
    })
  }

  const handleRemoveInclusion = (index: number) => {
    const updated = [...packageForm.inclusions]
    updated.splice(index, 1)
    setPackageForm({ ...packageForm, inclusions: updated })
  }

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!packageForm.title.trim()) {
      toast.error('Please enter the package title')
      return
    }

    const finalCategory =
      packageForm.category === 'Other' && packageForm.customCategory.trim()
        ? packageForm.customCategory.trim()
        : packageForm.category

    const whatsIncludedItems: PackageItem[] = packageForm.inclusions.map((text, idx) => ({
      id: `inc_${idx}_${Date.now()}`,
      text,
    }))

    const price = Number(packageForm.price) || 0
    let depositAmount = 0
    if (packageForm.depositType === 'percentage') {
      depositAmount = Math.round((price * (packageForm.depositValue || 0)) / 100)
    } else if (packageForm.depositType === 'fixed') {
      depositAmount = Number(packageForm.depositValue) || 0
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const payload: Partial<Package> = {
        title: packageForm.title.trim(),
        name: packageForm.title.trim(),
        category: finalCategory,
        serviceName: finalCategory,
        description: packageForm.description.trim(),
        price,
        pricingType: packageForm.pricingType,
        depositType: packageForm.depositType,
        depositValue: Number(packageForm.depositValue) || 0,
        depositAmount,
        currency: packageForm.currency || 'GHS',
        active: packageForm.active,
        status: packageForm.active ? 'active' : 'inactive',
        inclusions: packageForm.inclusions,
        whatsIncluded: whatsIncludedItems,
        updatedAt: now,
      }

      if (editingPackage) {
        await updateDocument(COLLECTIONS.PACKAGES, editingPackage.id, payload)
        toast.success('Package updated successfully.')
      } else {
        await addDocument(COLLECTIONS.PACKAGES, {
          ...payload,
          createdAt: now,
          createdBy: 'admin',
        })
        toast.success('Package created successfully.')
      }

      setIsPackageModalOpen(false)
      resetPackageForm()
    } catch (err) {
      console.error('Error saving package:', err)
      toast.error('Failed to save package.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTogglePackageStatus = async (pkg: Package) => {
    const newStatus = pkg.active === false || pkg.status === 'inactive'
    try {
      await updateDocument(COLLECTIONS.PACKAGES, pkg.id, {
        active: newStatus,
        status: newStatus ? 'active' : 'inactive',
        updatedAt: new Date().toISOString(),
      })
      toast.success(newStatus ? 'Package activated.' : 'Package deactivated.')
    } catch (err) {
      toast.error('Failed to update package status.')
    }
  }

  // Safe Package Deletion / Archiving
  const handleDeletePackageConfirm = async () => {
    if (!deletingPackage) return
    setIsSubmitting(true)
    try {
      // Check if package is used by any Quick Jobs
      const jobsUsingPkg = await getDocuments(COLLECTIONS.QUICK_JOBS, [])
      const isUsed = jobsUsingPkg.some(
        (j: any) => j.packageId === deletingPackage.id || j.packageTitle === deletingPackage.title
      )

      if (isUsed) {
        // Deactivate/archive instead of hard deletion to protect history
        await updateDocument(COLLECTIONS.PACKAGES, deletingPackage.id, {
          active: false,
          status: 'archived',
          updatedAt: new Date().toISOString(),
        })
        toast.success('Package archived to protect historical job records.')
      } else {
        await deleteDocument(COLLECTIONS.PACKAGES, deletingPackage.id)
        toast.success('Package deleted successfully.')
      }
      setDeletingPackage(null)
    } catch (err) {
      console.error('Error deleting package:', err)
      toast.error('Failed to delete package.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Add-On Handlers ---
  const resetAddOnForm = () => {
    setAddOnForm({
      name: '',
      category: 'General',
      price: 0,
      pricingType: 'fixed',
      description: '',
      active: true,
    })
    setEditingAddOn(null)
  }

  const openAddAddOnModal = () => {
    resetAddOnForm()
    setIsAddOnModalOpen(true)
  }

  const openEditAddOnModal = (addon: AddOn) => {
    setEditingAddOn(addon)
    setAddOnForm({
      name: addon.name,
      category: addon.category || 'General',
      price: addon.price,
      pricingType: addon.pricingType || 'fixed',
      description: addon.description || '',
      active: addon.active !== false,
    })
    setIsAddOnModalOpen(true)
  }

  const handleSaveAddOn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addOnForm.name.trim()) {
      toast.error('Please enter add-on name')
      return
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const payload: Partial<AddOn> = {
        name: addOnForm.name.trim(),
        category: addOnForm.category,
        price: Number(addOnForm.price) || 0,
        pricingType: addOnForm.pricingType,
        description: addOnForm.description.trim(),
        active: addOnForm.active,
        updatedAt: now,
      }

      if (editingAddOn) {
        await updateDocument(COLLECTIONS.ADD_ONS, editingAddOn.id, payload)
        toast.success('Add-on updated successfully.')
      } else {
        await addDocument(COLLECTIONS.ADD_ONS, {
          ...payload,
          createdAt: now,
          createdBy: 'admin',
        })
        toast.success('Add-on created successfully.')
      }

      setIsAddOnModalOpen(false)
      resetAddOnForm()
    } catch (err) {
      console.error('Error saving add-on:', err)
      toast.error('Failed to save add-on.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleAddOnStatus = async (addon: AddOn) => {
    try {
      await updateDocument(COLLECTIONS.ADD_ONS, addon.id, {
        active: !addon.active,
        updatedAt: new Date().toISOString(),
      })
      toast.success(addon.active ? 'Add-on deactivated.' : 'Add-on activated.')
    } catch (err) {
      toast.error('Failed to update add-on status.')
    }
  }

  const handleDeleteAddOnConfirm = async () => {
    if (!deletingAddOn) return
    setIsSubmitting(true)
    try {
      await deleteDocument(COLLECTIONS.ADD_ONS, deletingAddOn.id)
      toast.success('Add-on deleted successfully.')
      setDeletingAddOn(null)
    } catch (err) {
      console.error('Error deleting add-on:', err)
      toast.error('Failed to delete add-on.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Filtering & Computed ---
  const filteredPackages = packages.filter((p) => {
    const pkgCategory = (p.category || p.serviceName || '').trim()
    const matchesCat =
      selectedCategory === 'all'
        ? true
        : pkgCategory.toLowerCase() === selectedCategory.toLowerCase()

    const searchLower = search.toLowerCase()
    const matchesSearch =
      (p.title || p.name || '').toLowerCase().includes(searchLower) ||
      (p.description && p.description.toLowerCase().includes(searchLower)) ||
      (p.inclusions && p.inclusions.some((inc) => inc.toLowerCase().includes(searchLower)))

    const isActive = p.active !== false && p.status !== 'inactive'
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? isActive
        : !isActive

    return matchesCat && matchesSearch && matchesStatus
  })

  const filteredAddOns = addOns.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.description && a.description.toLowerCase().includes(search.toLowerCase())) ||
      (a.category && a.category.toLowerCase().includes(search.toLowerCase()))

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? a.active !== false
        : a.active === false

    return matchesSearch && matchesStatus
  })

  // Deposit Preview calculation helper
  const calcDepositPreview = () => {
    const p = Number(packageForm.price) || 0
    if (packageForm.depositType === 'none') {
      return { deposit: 0, balance: p, text: 'Full payment due on booking or completion' }
    }
    if (packageForm.depositType === 'fixed') {
      const dep = Number(packageForm.depositValue) || 0
      const bal = Math.max(0, p - dep)
      return {
        deposit: dep,
        balance: bal,
        text: `Fixed deposit: ${formatCurrency(dep)} · Balance: ${formatCurrency(bal)}`,
      }
    }
    const pct = Number(packageForm.depositValue) || 50
    const dep = Math.round((p * pct) / 100)
    const bal = Math.max(0, p - dep)
    return {
      deposit: dep,
      balance: bal,
      text: `${pct}% deposit: ${formatCurrency(dep)} · Balance: ${formatCurrency(bal)}`,
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Services & Packages"
        subtitle="Catalogue of official LEXMEDIA.GH services, packages, and client add-ons."
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleSyncCatalogue(true)}
              variant="outline"
              size="md"
              loading={isSyncing}
              icon={<RefreshCw size={15} />}
              title="Synchronise or restore official catalogue"
            >
              Sync Official Catalogue
            </Button>
            {activeTab === 'packages' ? (
              <Button
                onClick={openAddPackageModal}
                variant="primary"
                size="md"
                icon={<Plus size={16} />}
              >
                Add Package
              </Button>
            ) : (
              <Button
                onClick={openAddAddOnModal}
                variant="primary"
                size="md"
                icon={<Plus size={16} />}
              >
                Add Add-On
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs & Top Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'packages'
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <PackageIcon size={14} />
            <span>Packages Catalogue</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20">
              {packages.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('addons')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'addons'
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <PlusCircle size={14} />
            <span>Add-Ons</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20">
              {addOns.length}
            </span>
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Input
              placeholder={activeTab === 'packages' ? 'Search packages...' : 'Search add-ons...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={15} className="text-gray-400" />}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Category Pills (Only when on Packages tab) */}
      {activeTab === 'packages' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            All Categories ({packages.length})
          </button>
          {OFFICIAL_CATEGORIES.map((cat) => {
            const count = packages.filter(
              (p) => (p.category || p.serviceName || '').trim().toLowerCase() === cat.toLowerCase()
            ).length
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
                }`}
              >
                <span>{cat}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* TAB 1: PACKAGES CATALOGUE                                  */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeTab === 'packages' && (
        <div>
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
              <Spinner size="lg" />
              <p className="text-xs text-gray-500">Loading service catalogue...</p>
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <PackageIcon size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {search || statusFilter !== 'all' ? 'No packages found' : 'No packages yet'}
                </h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  {search || statusFilter !== 'all'
                    ? 'Try adjusting your search query or category filter.'
                    : 'Sync the official LEXMEDIA.GH catalogue or create your first package.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button onClick={() => handleSyncCatalogue(true)} variant="outline" size="sm" icon={<RefreshCw size={14} />}>
                  Sync Official Catalogue
                </Button>
                <Button onClick={openAddPackageModal} variant="primary" size="sm" icon={<Plus size={14} />}>
                  Add Package
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPackages.map((pkg) => {
                const isActive = pkg.active !== false && pkg.status !== 'inactive'
                const isStartingFrom = pkg.pricingType === 'starting_from'
                const inclusions =
                  pkg.inclusions && pkg.inclusions.length > 0
                    ? pkg.inclusions
                    : pkg.whatsIncluded
                    ? pkg.whatsIncluded.map((i) => i.text)
                    : []

                const category = pkg.category || pkg.serviceName || 'General'

                return (
                  <div
                    key={pkg.id}
                    className={`bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-200 p-5 flex flex-col justify-between shadow-xs hover:shadow-md ${
                      !isActive
                        ? 'opacity-65 border-dashed border-gray-300 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50'
                        : 'border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/40">
                          {category}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isStartingFrom && (
                            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/40">
                              Starting From
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                            }`}
                          >
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-snug">
                          {pkg.title || pkg.name}
                        </h3>
                        {pkg.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                            {pkg.description}
                          </p>
                        )}
                      </div>

                      {/* Inclusions Checklist */}
                      {inclusions.length > 0 && (
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                            Inclusions ({inclusions.length})
                          </span>
                          <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                            {inclusions.map((item, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300"
                              >
                                <CheckCircle2
                                  size={13}
                                  className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                                />
                                <span className="line-clamp-2">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Bottom Pricing & Actions */}
                    <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 flex items-end justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-gray-400 block leading-tight">
                          {isStartingFrom ? 'Starting Price' : 'Package Price'}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 font-mono tracking-tight">
                            {isStartingFrom ? 'From ' : ''}
                            {formatCurrency(pkg.price, pkg.currency || 'GHS')}
                          </span>
                        </div>
                        {/* Deposit rule */}
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 block">
                          {pkg.depositType === 'none'
                            ? 'Full upfront'
                            : pkg.depositType === 'fixed'
                            ? `Deposit: ${formatCurrency(pkg.depositValue || pkg.depositAmount || 0)}`
                            : `${pkg.depositValue ?? 50}% deposit`}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicatePackage(pkg)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                          title="Duplicate package"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPackageModal(pkg)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          title="Edit package"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePackageStatus(pkg)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isActive
                              ? 'text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          }`}
                          title={isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPackage(pkg)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          title="Delete or Archive package"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* TAB 2: ADD-ONS CATALOGUE                                   */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeTab === 'addons' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                  Optional Add-Ons
                </h3>
                <p className="text-xs text-gray-500">
                  Itemized extras that can be added to Quick Jobs and project scopes.
                </p>
              </div>
              <Button onClick={openAddAddOnModal} variant="primary" size="sm" icon={<Plus size={14} />}>
                Add Add-On
              </Button>
            </div>

            {filteredAddOns.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                No add-ons found. Click &quot;Sync Official Catalogue&quot; to restore defaults.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredAddOns.map((addon) => {
                  const isActive = addon.active !== false
                  const isStartingFrom = addon.pricingType === 'starting_from'

                  return (
                    <div
                      key={addon.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors ${
                        !isActive ? 'opacity-60 bg-gray-50/40 dark:bg-gray-950/40' : ''
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                            {addon.name}
                          </span>
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                            {addon.category || 'General'}
                          </span>
                          {!isActive && (
                            <span className="text-[10px] text-gray-400 border border-gray-200 dark:border-gray-700 px-1.5 rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        {addon.description && (
                          <p className="text-xs text-gray-500">{addon.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <span className="font-bold text-sm text-gray-900 dark:text-gray-100 font-mono">
                            {isStartingFrom ? 'From ' : ''}
                            {formatCurrency(addon.price)}
                          </span>
                          <span className="text-[10px] text-gray-400 block">
                            {isStartingFrom ? 'Estimate' : 'Fixed Rate'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditAddOnModal(addon)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAddOnStatus(addon)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isActive
                                ? 'text-gray-500 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Power size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingAddOn(addon)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT PACKAGE                                  */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        title={editingPackage ? 'Edit Package' : 'Create Package'}
        size="lg"
      >
        <form onSubmit={handleSavePackage} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Category *
              </label>
              <select
                value={packageForm.category}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, category: e.target.value })
                }
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {OFFICIAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="Other">Other (Custom Category)</option>
              </select>
            </div>

            {/* Custom category if selected */}
            {packageForm.category === 'Other' && (
              <div>
                <Input
                  label="Custom Category Name *"
                  placeholder="e.g. 3D Animation"
                  value={packageForm.customCategory}
                  onChange={(e) =>
                    setPackageForm({ ...packageForm, customCategory: e.target.value })
                  }
                  required
                />
              </div>
            )}

            {/* Package Title */}
            <div className={packageForm.category === 'Other' ? 'sm:col-span-2' : ''}>
              <Input
                label="Package Name / Title *"
                placeholder="e.g. Business Website"
                value={packageForm.title}
                onChange={(e) => setPackageForm({ ...packageForm, title: e.target.value })}
                required
              />
            </div>
          </div>

          <Textarea
            label="Short Description"
            placeholder="Briefly describe what this package is intended for..."
            value={packageForm.description}
            onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
            rows={2}
          />

          {/* Pricing & Deposit Configuration */}
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 space-y-3">
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 block">
              Pricing &amp; Deposit Structure
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Pricing Type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pricing Type
                </label>
                <select
                  value={packageForm.pricingType}
                  onChange={(e) =>
                    setPackageForm({
                      ...packageForm,
                      pricingType: e.target.value as PackagePricingType,
                    })
                  }
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
                >
                  <option value="fixed">Fixed Price</option>
                  <option value="starting_from">Starting From (From GH₵...)</option>
                </select>
              </div>

              {/* Price */}
              <div>
                <Input
                  label="Price (GH₵) *"
                  type="number"
                  min="0"
                  step="0.01"
                  value={packageForm.price}
                  onChange={(e) =>
                    setPackageForm({ ...packageForm, price: parseFloat(e.target.value) || 0 })
                  }
                  required
                />
              </div>

              {/* Deposit Type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Deposit Type
                </label>
                <select
                  value={packageForm.depositType}
                  onChange={(e) =>
                    setPackageForm({
                      ...packageForm,
                      depositType: e.target.value as PackageDepositType,
                    })
                  }
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
                >
                  <option value="percentage">Percentage (e.g. 50%)</option>
                  <option value="fixed">Fixed Amount (GH₵)</option>
                  <option value="none">No Predefined Deposit</option>
                </select>
              </div>
            </div>

            {/* Deposit Value if not none */}
            {packageForm.depositType !== 'none' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <Input
                    label={
                      packageForm.depositType === 'percentage'
                        ? 'Deposit Percentage (%)'
                        : 'Deposit Amount (GH₵)'
                    }
                    type="number"
                    min="0"
                    max={packageForm.depositType === 'percentage' ? 100 : undefined}
                    value={packageForm.depositValue}
                    onChange={(e) =>
                      setPackageForm({
                        ...packageForm,
                        depositValue: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="flex items-center text-xs text-gray-600 dark:text-gray-300 pt-5">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full text-center">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {calcDepositPreview().text}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Inclusions List */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Package Inclusions &amp; Deliverables
            </label>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Up to 5 hours coverage, 20 retouched photos..."
                value={packageForm.newInclusionText}
                onChange={(e) => setPackageForm({ ...packageForm, newInclusionText: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddInclusion()
                  }
                }}
                className="flex-1 h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button type="button" onClick={handleAddInclusion} variant="outline" size="sm">
                Add
              </Button>
            </div>

            {/* Inclusions tags */}
            {packageForm.inclusions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto">
                {packageForm.inclusions.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveInclusion(idx)}
                      className="text-gray-400 hover:text-rose-500 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={packageForm.active}
                onChange={(e) => setPackageForm({ ...packageForm, active: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Package is active in catalogue</span>
            </label>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsPackageModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                {editingPackage ? 'Save Changes' : 'Create Package'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT ADD-ON                                   */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isAddOnModalOpen}
        onClose={() => setIsAddOnModalOpen(false)}
        title={editingAddOn ? 'Edit Add-On' : 'Add New Add-On'}
        size="md"
      >
        <form onSubmit={handleSaveAddOn} className="space-y-4">
          <Input
            label="Add-On Name *"
            placeholder="e.g. Paystack integration"
            value={addOnForm.name}
            onChange={(e) => setAddOnForm({ ...addOnForm, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Applicable Service / Scope
              </label>
              <select
                value={addOnForm.category}
                onChange={(e) => setAddOnForm({ ...addOnForm, category: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
              >
                <option value="General">General / All Services</option>
                {OFFICIAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Pricing Type
              </label>
              <select
                value={addOnForm.pricingType}
                onChange={(e) =>
                  setAddOnForm({
                    ...addOnForm,
                    pricingType: e.target.value as 'fixed' | 'starting_from',
                  })
                }
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
              >
                <option value="fixed">Fixed Rate</option>
                <option value="starting_from">Starting From (Estimate)</option>
              </select>
            </div>
          </div>

          <Input
            label="Rate / Price (GH₵) *"
            type="number"
            min="0"
            step="0.01"
            value={addOnForm.price}
            onChange={(e) => setAddOnForm({ ...addOnForm, price: parseFloat(e.target.value) || 0 })}
            required
          />

          <Textarea
            label="Description (Optional)"
            placeholder="What does this add-on include?"
            value={addOnForm.description}
            onChange={(e) => setAddOnForm({ ...addOnForm, description: e.target.value })}
            rows={2}
          />

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={addOnForm.active}
                onChange={(e) => setAddOnForm({ ...addOnForm, active: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Add-on is active</span>
            </label>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddOnModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                {editingAddOn ? 'Save Changes' : 'Create Add-On'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE PACKAGE CONFIRMATION (With Safety Protection) */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!deletingPackage}
        onClose={() => setDeletingPackage(null)}
        title="Delete or Archive Package"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-xs">
            <ShieldAlert size={18} className="shrink-0 text-amber-600 mt-0.5" />
            <p>
              If this package has been selected in historical Quick Jobs or client links, it will be safely <strong>archived/deactivated</strong> to preserve agreed project balances.
            </p>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-300">
            Are you sure you want to remove <strong>{deletingPackage?.title || deletingPackage?.name}</strong>?
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="ghost" size="sm" onClick={() => setDeletingPackage(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isSubmitting}
              onClick={handleDeletePackageConfirm}
            >
              Confirm Removal
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE ADD-ON CONFIRMATION                          */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!deletingAddOn}
        onClose={() => setDeletingAddOn(null)}
        title="Delete Add-On"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Are you sure you want to delete add-on <strong>{deletingAddOn?.name}</strong>?
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="ghost" size="sm" onClick={() => setDeletingAddOn(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isSubmitting}
              onClick={handleDeleteAddOnConfirm}
            >
              Delete Add-On
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
