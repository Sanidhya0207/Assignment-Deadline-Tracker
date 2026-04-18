/* ========================================================================
   DeadlineFlow — Student Assignment Deadline Tracker
   All application logic: data management, rendering, theme, undo toast
   ======================================================================== */

// ======================== DATA LAYER ========================

/** LocalStorage key for tasks */
const STORAGE_KEY = 'deadlineflow_tasks';

/** LocalStorage key for theme preference */
const THEME_KEY = 'deadlineflow_theme';

/**
 * Load tasks from localStorage.
 * @returns {Array} Array of task objects
 */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save tasks to localStorage.
 * @param {Array} tasks - Array of task objects to persist
 */
function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Generate a simple unique ID for each task.
 * @returns {string} UUID-like identifier
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ======================== DATE HELPERS ========================

/**
 * Calculate the number of calendar days between today and a given date.
 * A positive result means the date is in the future; negative means overdue.
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {number} Days remaining (negative if overdue)
 */
function daysRemaining(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  const diff = due - today;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Return a human-readable urgency label and CSS class based on days remaining.
 * @param {number} days - Days until due
 * @returns {{ label: string, cssClass: string, urgencyClass: string }}
 */
function getUrgency(days) {
  if (days < 0) {
    return {
      label: days === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(days)} days`,
      cssClass: 'due-overdue',
      urgencyClass: 'urgency-overdue'
    };
  }
  if (days === 0) {
    return { label: 'Due Today', cssClass: 'due-today', urgencyClass: 'urgency-today' };
  }
  if (days === 1) {
    return { label: 'Due Tomorrow', cssClass: 'due-soon', urgencyClass: 'urgency-soon' };
  }
  if (days <= 3) {
    return { label: `Due in ${days} days`, cssClass: 'due-soon', urgencyClass: 'urgency-soon' };
  }
  if (days <= 7) {
    return { label: `Due in ${days} days`, cssClass: 'due-safe', urgencyClass: 'urgency-safe' };
  }
  return { label: `Due in ${days} days`, cssClass: 'due-safe', urgencyClass: 'urgency-safe' };
}

/**
 * Format an ISO date string into a more readable format (e.g., "Mon, Apr 19").
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted date
 */
function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// ======================== COURSE COLOR CODING ========================

/**
 * A curated palette of distinct, pleasant colors for course identification.
 * These work well in both light and dark themes.
 */
const COURSE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#a855f7', // purple
  '#d946ef', // fuchsia
];

/** Cache for course → color mapping within a session */
const courseColorMap = {};

/**
 * Deterministically assign a color to a course name.
 * Uses a simple hash to ensure the same course always gets the same color.
 * @param {string} courseName - The course name string
 * @returns {string} Hex color code
 */
function getCourseColor(courseName) {
  const normalized = courseName.trim().toLowerCase();

  if (courseColorMap[normalized]) {
    return courseColorMap[normalized];
  }

  // Simple string hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // convert to 32-bit int
  }
  const index = Math.abs(hash) % COURSE_COLORS.length;
  courseColorMap[normalized] = COURSE_COLORS[index];
  return COURSE_COLORS[index];
}

// ======================== THEME MANAGEMENT ========================

/**
 * Initialize and toggle dark/light theme.
 * Saves preference to localStorage.
 */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
}

// ======================== UNDO / TOAST SYSTEM ========================

let toastTimeout = null;
let undoData = null; // { task, index } — the removed task and its position

/**
 * Show the undo toast notification with a 4-second auto-dismiss.
 * @param {Object} task - The task that was completed
 * @param {number} index - The original position of the task in the sorted list
 */
function showToast(task, index) {
  const toast = document.getElementById('undo-toast');
  const message = document.querySelector('.toast-message');

  // Store undo data
  undoData = { task, index };

  // Update message
  message.textContent = `"${task.taskName}" completed!`;

  // Reset animation
  const progress = toast.querySelector('.toast-progress');
  progress.style.animation = 'none';
  // Force reflow
  void progress.offsetWidth;
  progress.style.animation = '';

  // Show toast
  toast.classList.remove('hidden');
  // Small delay so transition fires
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Clear any existing timeout
  if (toastTimeout) clearTimeout(toastTimeout);

  // Auto-dismiss after 4 seconds
  toastTimeout = setTimeout(() => {
    hideToast();
  }, 4000);
}

/** Hide the undo toast and clear undo data. */
function hideToast() {
  const toast = document.getElementById('undo-toast');
  toast.classList.remove('visible');
  // After transition ends, hide completely
  setTimeout(() => {
    toast.classList.add('hidden');
    undoData = null;
  }, 350);
}

/** Undo the last "Done" action — re-add the task. */
function undoComplete() {
  if (!undoData) return;

  const tasks = loadTasks();
  tasks.push(undoData.task);
  saveTasks(tasks);
  renderAll();
  hideToast();
}

// ======================== RENDERING ========================

/**
 * Render the full task list and update dashboard stats.
 * Tasks are sorted by urgency (closest/overdue first).
 */
function renderAll() {
  const tasks = loadTasks();
  const listEl = document.getElementById('task-list');
  const emptyEl = document.getElementById('empty-state');

  // Sort by due date ascending (most urgent first)
  tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // Clear existing cards
  listEl.innerHTML = '';

  // Track stats
  let totalCount = tasks.length;
  let urgentCount = 0;
  let upcomingCount = 0;

  if (tasks.length === 0) {
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');

    tasks.forEach((task, i) => {
      const days = daysRemaining(task.dueDate);
      const urgency = getUrgency(days);
      const color = getCourseColor(task.courseName);

      // Count stats
      if (days <= 3) {
        urgentCount++;
      } else {
        upcomingCount++;
      }

      // Build card
      const card = document.createElement('div');
      card.className = `task-card ${urgency.urgencyClass}`;
      card.setAttribute('data-id', task.id);
      card.style.animationDelay = `${i * 50}ms`;

      card.innerHTML = `
        <div class="course-dot" style="background: ${color}; color: ${color};"></div>
        <div class="task-info">
          <div class="task-course">${escapeHtml(task.courseName)}</div>
          <div class="task-name">${escapeHtml(task.taskName)}</div>
          <div class="task-due ${urgency.cssClass}">
            <span class="due-label">${urgency.label}</span>
            <span class="task-date-text">${formatDate(task.dueDate)}</span>
          </div>
        </div>
        <button class="task-done-btn" aria-label="Mark as done" title="Mark as done"></button>
      `;

      // Attach done button handler
      const doneBtn = card.querySelector('.task-done-btn');
      doneBtn.addEventListener('click', () => completeTask(task.id));

      listEl.appendChild(card);
    });
  }

  // Update dashboard
  document.getElementById('total-count').textContent = totalCount;
  document.getElementById('urgent-count').textContent = urgentCount;
  document.getElementById('upcoming-count').textContent = upcomingCount;
}

/**
 * Mark a task as done: remove from list with animation, show undo toast.
 * @param {string} taskId - The ID of the task to complete
 */
function completeTask(taskId) {
  const tasks = loadTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  // Remove from data
  const [removedTask] = tasks.splice(taskIndex, 1);
  saveTasks(tasks);

  // Animate the card out
  const card = document.querySelector(`.task-card[data-id="${taskId}"]`);
  if (card) {
    card.classList.add('completing');
    // Re-render after animation completes
    setTimeout(() => {
      renderAll();
    }, 420);
  } else {
    renderAll();
  }

  // Show undo toast
  showToast(removedTask, taskIndex);
}

/**
 * Escape HTML entities to prevent XSS in user-entered text.
 * @param {string} str - Raw string
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ======================== FORM HANDLING ========================

/**
 * Handle form submission: validate, create a new task, save, and re-render.
 * @param {Event} e - The submit event
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const courseInput = document.getElementById('course-name');
  const taskInput = document.getElementById('task-name');
  const dateInput = document.getElementById('due-date');

  const courseName = courseInput.value.trim();
  const taskName = taskInput.value.trim();
  const dueDate = dateInput.value;

  // Basic validation
  if (!courseName || !taskName || !dueDate) return;

  // Create task object
  const task = {
    id: generateId(),
    courseName,
    taskName,
    dueDate,
    createdAt: new Date().toISOString()
  };

  // Save
  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);

  // Clear form
  courseInput.value = '';
  taskInput.value = '';
  dateInput.value = '';

  // Focus back to first field for quick entry
  courseInput.focus();

  // Re-render
  renderAll();
}

// ======================== INITIALIZATION ========================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme
  initTheme();

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Form submission
  document.getElementById('task-form').addEventListener('submit', handleFormSubmit);

  // Undo button in toast
  document.getElementById('undo-btn').addEventListener('click', undoComplete);

  // Set minimum date on the date input to today
  const dateInput = document.getElementById('due-date');
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.setAttribute('min', `${yyyy}-${mm}-${dd}`);

  // Initial render
  renderAll();
});
