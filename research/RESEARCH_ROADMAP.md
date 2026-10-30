# Research roadmap — Artery Segmentation and Stenosis Detection

## Modality and datasets
- ImageCAS / ImageCAS-X: 3D coronary CT angiography resources, relevant to artery segmentation and vessel geometry.
- ARCADE: 2D X-ray angiography resource with task-specific annotations. Do not merge it directly with CCTA data as if it were the same modality.
- ICA_NJ_BinarySeg and CADICA: verify official documentation, data structure, licensing, annotation definitions and splits before use.
- Dataset archive names/sizes do not establish annotation quality, patient counts, or de-identification. Verify the extracted content and the official terms.

## Research workflow
1. Confirm dataset source, permitted use and modality.
2. Inspect file structure and official train/validation/test lists.
3. Pair each image with its correct mask and check dimensions, affine/orientation, spacing, labels and empty masks.
4. Run the EDA notebook on the actual extracted dataset; export real counts and figures.
5. Establish a baseline U-Net; compare with 3D U-Net for volumetric CCTA when compute permits.
6. Evaluate segmentation with Dice, IoU and visual overlays.
7. Apply cautious post-processing and assess vessel continuity.
8. Explore centerline and diameter estimation using physical voxel spacing.
9. Only estimate stenosis when suitable lesion labels or validated reference measurements exist.

## Important implementation distinction
The web app currently supports account access, case management, image file storage and initial file validation/header inspection. The new 3D U-Net is a research starter, not a trained model connected to the API. Full intensity normalization/resampling, mask inference, segmentation post-processing, vessel extraction and stenosis estimation are future tasks and must be validated before being described as complete.
