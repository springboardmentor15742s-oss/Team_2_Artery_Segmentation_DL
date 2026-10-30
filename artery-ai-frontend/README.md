# Artery Segmentation & Stenosis Detection Platform — Frontend (Milestone 1)

This repository contains the **Milestone 1 Frontend** for the clinical diagnostic suite:
**“Artery Segmentation and Stenosis Detection Using Advanced DL Techniques”**.

In accordance with Milestone 1 specifications and clinical UI guidelines:
- Strictly adheres to professional medical application terminology (Dashboard, Medical Image Analysis, Case Management, Patient Details, Upload Scan, Analysis Status, Analysis Results, Reports).
- Completely excludes unnecessary mentions or branding of the word “AI” across UI elements.
- Uses **React.js**, **JavaScript**, **Tailwind CSS**, **Chart.js** (for clinical metrics), and **React Router**.
- Uses an isolated API abstraction layer (`src/services/api.js`) and mock data repository (`src/data/mockData.js`) designed for direct drop-in replacement with FastAPI backend endpoints in future milestones.
- Does **not** include downstream ML model inference, segmentation masks, centerline extraction, or Grad-CAM maps (reserved for Milestone 2+).

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### Installation & Running Locally

1. Navigate to the frontend directory:
   ```bash
   cd artery-ai-frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## 🧭 Routes & Pages

| Route | Page | Description |
|---|---|---|
| `/login` | **Sign In** | Clinical practitioner authentication with institutional validation |
| `/register` | **Register** | Practitioner signup supporting Radiologist, Researcher, ML Engineer, Admin roles |
| `/dashboard` | **Dashboard** | Clinical case statistics, Chart.js modality & anatomical region charts, recent cases |
| `/cases` | **Case Management** | Full clinical case table, search, filters by status/modality/region, pagination, editing |
| `/cases/new` | **Create Case** | Patient demographics, cardiovascular risk factors chips, and imaging protocol form |
| `/cases/:id` | **Case Details** | Comprehensive patient info, case info, scan specifications, and preprocessing pipeline |
| `/upload` | **Upload Scan** | Medical scan drag & drop, DICOM/NIfTI validation, progress bar, retry, and case link |
| `/reports` | **Reports** | Diagnostic reports placeholder table, preview modal, and clinical report download |
| `/notifications` | **Notifications** | Pipeline ingestion events, quality assurance alerts, read/unread states |
| `/profile` | **Profile** | Practitioner info, institutional department/license, password update, logout |

---

## 📁 Project Directory Structure

```text
artery-ai-frontend/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── assets/
    ├── components/
    │   ├── Button/
    │   │   └── Button.jsx
    │   ├── Card/
    │   │   └── Card.jsx
    │   ├── FileUpload/
    │   │   └── FileUpload.jsx
    │   ├── Header/
    │   │   └── Header.jsx
    │   ├── Input/
    │   │   └── Input.jsx
    │   ├── Loading/
    │   │   └── LoadingSpinner.jsx
    │   ├── Modal/
    │   │   └── Modal.jsx
    │   ├── Notification/
    │   │   └── NotificationBadge.jsx
    │   ├── Preprocessing/
    │   │   └── PreprocessingStatus.jsx
    │   ├── Select/
    │   │   └── Select.jsx
    │   ├── Sidebar/
    │   │   └── Sidebar.jsx
    │   ├── StatusBadge/
    │   │   └── StatusBadge.jsx
    │   └── Table/
    │       └── Table.jsx
    │
    ├── data/
    │   └── mockData.js          # Isolated mock cases, notifications, reports & constants
    │
    ├── layouts/
    │   └── MainLayout.jsx       # Layout containing responsive Sidebar, Header, Outlet
    │
    ├── pages/
    │   ├── CaseDetails.jsx      # Case record, scan section, preprocessing checkpoints
    │   ├── Cases.jsx            # Case management table, filters, search, edit modal
    │   ├── CreateCase.jsx       # New case creation with form validation
    │   ├── Dashboard.jsx        # Clinical metrics, Chart.js charts, recent cases
    │   ├── Login.jsx            # Sign in page
    │   ├── Notifications.jsx    # Clinical notifications interface
    │   ├── Profile.jsx          # User profile & credentials management
    │   ├── Register.jsx         # Registration page with 4 official roles
    │   ├── Reports.jsx          # Reports placeholder and export
    │   └── Upload.jsx           # Medical image upload interface
    │
    ├── routes/
    │   └── AppRoutes.jsx        # Application routing definitions
    │
    ├── services/
    │   └── api.js               # Abstracted API service layer with localStorage persistence
    │
    ├── App.jsx
    ├── index.css                # Tailwind directives & medical utility classes
    └── main.jsx
```

---

## 🩺 Milestone 1 Scope Completed

- [x] Full UI wireframes translated into clinical application screens
- [x] React.js + Tailwind CSS + Chart.js setup
- [x] Sign In & Registration with role selection and password complexity validation
- [x] Dashboard with KPI metrics, modality doughnut chart, anatomical region bar chart
- [x] Case Management with search, filter, pagination, status badges, and edit dialog
- [x] Patient / Case creation form with risk factors and validation
- [x] Case Details with patient background, scan specifications, and viewport placeholder
- [x] Medical image upload (drag-and-drop, browse, DICOM/NIfTI format validation, file size check, simulated progress, retry, success/failure states)
- [x] Basic Preprocessing representation (Image Validation ✓, Format Conversion ✓, Resolution Check ✓, Image Preparation ✓, Ready for Analysis ✓)
- [x] Clinical profile management with password update
- [x] Clinical notifications system with categorization and unread badges
- [x] Diagnostic reports placeholder with download simulation
- [x] Complete exclusion of unnecessary "AI" terminology across the user interface
- [x] Fully prepared `src/services/api.js` for upcoming FastAPI integration

---

## 🔮 Scope for Subsequent Milestones (Milestones 2, 3, 4)

The following components are intentionally deferred to future milestones:
- Artery segmentation deep learning models (e.g. 3D U-Net, V-Net)
- Stenosis detection and localization models
- Stenosis severity grading and lumen cross-section calculations
- Centerline extraction and multi-planar reconstruction (MPR)
- Grad-CAM visual explainability maps
- Real-time deep learning inference backend API (FastAPI)
