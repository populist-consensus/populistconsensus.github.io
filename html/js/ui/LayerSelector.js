/**
 * LayerSelector - Custom Layer Selection Dropdown
 *
 * Manages the custom layer selector with categorized groups:
 * - Collapsible layer groups (Electoral, Analytical, Demographic, Administrative)
 * - Current selection display
 * - "None" option for base map only
 * - Layer explanations integration
 *
 * Extracted from the monolithic election_map.html JavaScript code.
 */

import { StateManager } from '../core/StateManager.js'
import { EventBus } from '../core/EventBus.js'

export class LayerSelector {
  constructor (stateManager, eventBus) {
    this.stateManager = stateManager
    this.eventBus = eventBus

    // DOM references
    this.container = null
    this.currentSelection = null
    this.dropdown = null

    // State tracking
    this.isInitialized = false
    this.isOpen = false

    // Category configuration
    this.categoryOrder = [
      { key: 'electoral', name: '📊 Results' },
      { key: 'analytical', name: '🔬 Analytics' },
      { key: 'demographic', name: '👥 Demographics' },
      { key: 'administrative', name: '📋 Admin' }
    ]

    console.log('[LayerSelector] Initialized')
  }

  /**
   * Initialize the layer selector
   */
  initialize () {
    if (this.isInitialized) {
      console.warn('[LayerSelector] Already initialized')
      return
    }

    try {
      this.findContainer()
      this.setupEventListeners()
      this.setupHybridInterface()
      this.restoreGroupStates()

      this.isInitialized = true
      console.log('[LayerSelector] Successfully initialized')
    } catch (error) {
      console.error('[LayerSelector] Failed to initialize:', error)
    }
  }

  /**
   * Find the container element
   */
  findContainer () {
    this.container = document.getElementById('layer-selector-dropdown')
    this.primaryCards = document.getElementById('primary-layer-cards')
    this.showMoreBtn = document.getElementById('show-more-layers')
    this.fullLayersSection = document.getElementById('full-layers-section')

    if (!this.container) {
      console.warn('[LayerSelector] Full layer selector container not found')
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners () {
    // Listen for data changes
    this.eventBus.on('data:processed', (data) => {
      this.updateOptions(data.processedData)
    })

    // Listen for update requests from ControlPanel
    this.eventBus.on('ui:layerOptionsUpdateRequested', () => {
      this.updateOptions()
    })

    // Listen for enabled state changes from ControlPanel
    this.eventBus.on('ui:layerSelectorEnabledChanged', (data) => {
      this.setEnabled(data.enabled)
    })

    // Listen for data cleared (no data selected)
    this.eventBus.on('data:cleared', () => {
      this.handleDataCleared()
    })

    // Listen for click events outside the dropdown to close it
    document.addEventListener('click', (e) => {
      // Check if the click was outside the dropdown container
      const container = this.findContainer() // Find the container element
      const showMoreButton = document.getElementById('show-more-layers') // Find the show more button

      // If the container exists and the click is outside the container AND outside the show more button
      if (container && !container.contains(e.target) && showMoreButton && !showMoreButton.contains(e.target)) {
        this.closeDropdown() // Call the new method
      }
    })

    // Subscribe to StateManager for current field changes
    this.stateManager.subscribe('currentField', (stateChanges) => {
      this.handleCurrentFieldChange(stateChanges)
    })

    console.log('[LayerSelector] Event listeners set up')
  }

  /**
   * Set up the hybrid interface (cards + show more)
   */
  setupHybridInterface () {
    if (!this.showMoreBtn || !this.fullLayersSection) return

    // Set up show more button
    this.showMoreBtn.addEventListener('click', () => {
      this.toggleFullLayerSelection()
    })

    // Set up primary card click handlers
    if (this.primaryCards) {
      this.primaryCards.addEventListener('click', (event) => {
        const card = event.target.closest('.layer-card')
        if (card && card.dataset.layer) {
          this.selectLayer(card.dataset.layer)
        }
      })
    }

    console.log('[LayerSelector] Hybrid interface set up')
  }

  /**
     * Update layer options based on processed data
     */
  updateOptions (processedData = null) {
    if (!processedData) {
      // Get current processed data from state
      const allData = this.stateManager.getState('processedData')
      const fieldInfo = this.stateManager.getState('fieldInfo')
      const layerOrganization = this.stateManager.getState('layerOrganization')

      processedData = {
        layerOrganization,
        fieldInfo
      }
    }

    // Always build the selector, even with empty data (to show None option)
    const layerOrganization = processedData?.layerOrganization || {}
    const fieldInfo = processedData?.fieldInfo || {}

    this.buildSelector(layerOrganization, fieldInfo)
    this.updateSelectionDisplay()

    console.log('[LayerSelector] Options updated')
  }

  /**
     * Build the custom selector UI
     */
  buildSelector (layersByCategory, fieldInfo) {
    if (!this.container) {
      console.warn('[LayerSelector] No container found for building selector')
      return
    }

    this.container.innerHTML = ''

    // Add "None" option
    this.addNoneOption()

    // Add categorized layers
    this.categoryOrder.forEach(({ key, name }) => {
      const categoryLayers = layersByCategory[key]
      if (categoryLayers && categoryLayers.length > 0) {
        this.addLayerGroup(key, name, categoryLayers, fieldInfo)
      }
    })

    // Add uncategorized layers
    const uncategorized = layersByCategory.other || []
    if (uncategorized.length > 0) {
      this.addLayerGroup('other', '🔹 Other', uncategorized, fieldInfo)
    }

    // Restore group states after building
    this.restoreGroupStates()

    console.log('[LayerSelector] Built selector with', Object.keys(layersByCategory).length, 'categories')
  }

  /**
     * Add "None" option for base map only
     */
  addNoneOption () {
    const noneOption = document.createElement('div')
    noneOption.className = 'layer-option none-option'
    noneOption.dataset.value = 'none'
    noneOption.textContent = 'No Data Layer (Base Map Only)'
    noneOption.onclick = () => this.selectLayer('none')
    this.container.appendChild(noneOption)
  }

  /**
   * Add a collapsible layer group
   */
  addLayerGroup (groupKey, groupName, layers, fieldInfo) {
    const group = document.createElement('div')
    group.className = 'layer-group collapsed'
    group.dataset.group = groupKey

    // Group header (collapsible)
    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'layer-group-header'
    header.innerHTML = `
            <span>${groupName}</span>
            <span class="layer-group-toggle">▼</span>
        `
    header.onclick = () => this.toggleLayerGroup(groupKey)
    group.appendChild(header)

    // Group content
    const content = document.createElement('div')
    content.className = 'layer-group-content'

    // Sort layers within category alphabetically by display name
    const sortedLayers = layers
      .map(layer => ({
        value: layer,
        display: this.getFieldDisplayName(layer, fieldInfo)
      }))
      .sort((a, b) => a.display.localeCompare(b.display))

    sortedLayers.forEach(({ value, display }) => {
      const option = document.createElement('div')
      option.className = 'layer-option'
      option.dataset.value = value
      option.textContent = display
      option.onclick = () => this.selectLayer(value)
      content.appendChild(option)
    })

    group.appendChild(content)

    // Add large-group class for groups with many items
    if (sortedLayers.length > 10) {
      group.classList.add('large-group')
    }

    this.container.appendChild(group)
  }

  /**
     * Get field display name with fallback
     */
  getFieldDisplayName (fieldKey, fieldInfo) {
    if (fieldInfo && fieldInfo.displayNames && fieldInfo.displayNames[fieldKey]) {
      return fieldInfo.displayNames[fieldKey]
    }

    // Fallback to generating display name
    return this.generateDisplayName(fieldKey)
  }

  /**
     * Generate display name from field key
     */
  generateDisplayName (fieldKey) {
    // Handle candidate fields
    if (fieldKey.startsWith('votes_') && fieldKey !== 'votes_total') {
      const candidateName = fieldKey.replace('votes_', '')
      return `Vote Count - ${this.toTitleCase(candidateName)}`
    }

    if (fieldKey.startsWith('vote_pct_') && !fieldKey.startsWith('vote_pct_contribution_')) {
      const candidateName = fieldKey.replace('vote_pct_', '')
      return `Vote % - ${this.toTitleCase(candidateName)}`
    }

    if (fieldKey.startsWith('vote_pct_contribution_')) {
      const candidateName = fieldKey.replace('vote_pct_contribution_', '')
      return `Vote Contribution % - ${this.toTitleCase(candidateName)}`
    }

    if (fieldKey.startsWith('reg_pct_')) {
      const party = fieldKey.replace('reg_pct_', '').toUpperCase()
      return `Registration % - ${party}`
    }

    // Default: convert to title case
    return this.toTitleCase(fieldKey)
  }

  /**
     * Convert snake_case to Title Case
     */
  toTitleCase (str) {
    if (!str) return ''
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  /**
     * Restore layer group states from localStorage
     */
  restoreGroupStates () {
    const groupStates = JSON.parse(localStorage.getItem('layerGroupStates') || '{}')

    this.container.querySelectorAll('.layer-group').forEach(group => {
      const groupKey = group.dataset.group
      if (groupStates.hasOwnProperty(groupKey)) {
        if (groupStates[groupKey]) {
          group.classList.remove('collapsed')
        } else {
          group.classList.add('collapsed')
        }
      } else {
        // Keep default collapsed state for new groups
        group.classList.add('collapsed')
      }
    })
  }

  /**
   * Select a layer
   */
  selectLayer (layerValue) {
    console.log(`[LayerSelector] Layer selected: ${layerValue}`)

    // Update state
    this.stateManager.setState({
      currentField: layerValue,
      customRange: null // Reset custom range when changing layers
    })

    // Update UI - both primary cards and full selector
    this.updatePrimaryCardSelection(layerValue)
    this.updateSelectionDisplay(layerValue)

    // Emit event
    this.eventBus.emit('ui:layerSelected', { layerKey: layerValue })
  }

  /**
     * Update the current selection display
     */
  updateSelectionDisplay (layerKey = null) {
    if (!layerKey) {
      layerKey = this.stateManager.getState('currentField') || 'political_lean'
    }

    // Update selected state in options within our container
    if (this.container) {
      this.container.querySelectorAll('.layer-option').forEach(option => {
        if (option.dataset.value === layerKey) {
          option.classList.add('selected')
        } else {
          option.classList.remove('selected')
        }
      })
    }
  }

  /**
     * Toggle individual layer group
     */
  toggleLayerGroup (groupKey) {
    const group = document.querySelector(`[data-group="${groupKey}"]`)
    if (!group) return

    group.classList.toggle('collapsed')

    // Save group state to localStorage
    this.saveGroupState(groupKey, !group.classList.contains('collapsed'))
  }

  /**
     * Save group state to localStorage
     */
  saveGroupState (groupKey, isExpanded) {
    const groupStates = JSON.parse(localStorage.getItem('layerGroupStates') || '{}')
    groupStates[groupKey] = isExpanded
    localStorage.setItem('layerGroupStates', JSON.stringify(groupStates))
  }

  /**
     * Get currently selected layer
     */
  getSelectedLayer () {
    return this.stateManager.getState('currentField')
  }

  /**
     * Set enabled/disabled state
     */
  setEnabled (enabled) {
    if (this.container) {
      this.container.style.pointerEvents = enabled ? 'auto' : 'none'
      this.container.style.opacity = enabled ? '1' : '0.5'
    }
  }

  /**
     * Clear current selection
     */
  clear () {
    this.updateSelectionDisplay('none')
  }

  /**
     * Validate current state
     */
  validate () {
    const selectedLayer = this.getSelectedLayer()
    const issues = []

    if (!selectedLayer) {
      issues.push('No layer selected')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  /**
   * Toggle full layer selection visibility
   */
  toggleFullLayerSelection () {
    if (!this.fullLayersSection || !this.showMoreBtn) return

    const isExpanded = this.fullLayersSection.style.display !== 'none'
    const controlPanel = document.querySelector('.control-panel')

    if (isExpanded) {
      this.fullLayersSection.style.display = 'none'
      this.showMoreBtn.classList.remove('expanded')
      this.showMoreBtn.querySelector('.show-more-text').textContent = 'Show All Layers'

      // Remove expanded class from control panel
      if (controlPanel) {
        controlPanel.classList.remove('layers-expanded')
      }
    } else {
      this.fullLayersSection.style.display = 'block'
      this.showMoreBtn.classList.add('expanded')
      this.showMoreBtn.querySelector('.show-more-text').textContent = 'Hide Extra Layers'

      // Add expanded class to control panel for dynamic sizing
      if (controlPanel) {
        controlPanel.classList.add('layers-expanded')
      }

      // Setup scroll indicators after showing
      setTimeout(() => {
        this.setupScrollIndicators(this.fullLayersSection)
      }, 100)
    }
  }

  /**
   * Setup scroll indicators for better UX
   */
  setupScrollIndicators (scrollContainer) {
    if (!scrollContainer) return

    const updateScrollIndicators = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer

      // Check if content is scrollable
      const isScrollable = scrollHeight > clientHeight

      if (!isScrollable) {
        scrollContainer.classList.remove('has-scroll-top', 'has-scroll-bottom')
        return
      }

      // Check scroll position
      const hasScrollTop = scrollTop > 5
      const hasScrollBottom = scrollTop < (scrollHeight - clientHeight - 5)

      // Update classes
      scrollContainer.classList.toggle('has-scroll-top', hasScrollTop)
      scrollContainer.classList.toggle('has-scroll-bottom', hasScrollBottom)
    }

    // Initial check
    updateScrollIndicators()

    // Listen for scroll events
    scrollContainer.addEventListener('scroll', updateScrollIndicators)

    // Listen for resize events
    const resizeObserver = new ResizeObserver(updateScrollIndicators)
    resizeObserver.observe(scrollContainer)

    console.log('[LayerSelector] Scroll indicators set up')
  }

  /**
   * Handle data cleared event
   */
  handleDataCleared () {
    // Update primary cards to show "none" as selected
    this.updatePrimaryCardSelection('none')

    // Clear the full layer selector
    if (this.container) {
      this.container.innerHTML = '<p style="padding: var(--space-3); color: var(--color-text-secondary); font-style: italic;">No data loaded - select a dataset to see layer options</p>'
    }
  }

  /**
   * Update primary card selection state
   */
  updatePrimaryCardSelection (selectedLayer) {
    if (!this.primaryCards) return

    const cards = this.primaryCards.querySelectorAll('.layer-card')
    cards.forEach(card => {
      if (card.dataset.layer === selectedLayer) {
        card.classList.add('active')
      } else {
        card.classList.remove('active')
      }
    })
  }

  /**
   * Expand all layer groups for better UX
   */
  expandAllLayerGroups () {
    if (!this.container) return

    const layerGroups = this.container.querySelectorAll('.layer-group')
    layerGroups.forEach(group => {
      group.classList.remove('collapsed')
    })

    console.log('[LayerSelector] Expanded all layer groups for better UX')
  }

  /**
   * Collapse all layer groups (restore default state)
   */
  collapseAllLayerGroups () {
    if (!this.container) return

    const layerGroups = this.container.querySelectorAll('.layer-group')
    layerGroups.forEach(group => {
      group.classList.add('collapsed')
    })

    console.log('[LayerSelector] Collapsed all layer groups')
  }

  /**
   * Clean up resources
   */
  destroy () {
    // Remove event listeners
    document.removeEventListener('click', this.closeDropdown)

    // Clear DOM references
    this.container = null
    this.primaryCards = null
    this.showMoreBtn = null
    this.fullLayersSection = null

    this.isInitialized = false

    console.log('[LayerSelector] Destroyed')
  }

  /**
   * Close the dropdown
   */
  closeDropdown () {
    if (!this.container) return

    this.container.style.display = 'none'
    this.isOpen = false

    console.log('[LayerSelector] Closed dropdown')
  }

  /**
   * Handle current field state change from StateManager
   */
  handleCurrentFieldChange (stateChanges) {
    if (stateChanges.hasOwnProperty('currentField')) {
      const layerKey = stateChanges.currentField
      this.updateSelectionDisplay(layerKey)
    }
  }
}
