# Local model benchmark summary

This document summarizes the current saved reports. These are software/research benchmarks, not clinical validation.

## Stenosis classification

The configured report evaluates the Random Forest QCA-feature classifier on 135 held-out cases from the locally generated, synthetic 675-case manifest (472 train, 68 validation, 135 test).

| Metric | Random Forest classifier | Logistic-regression QCA baseline |
|---|---:|---:|
| Accuracy | 97.78% | 96.30% |
| ROC AUC | 0.9993 | 0.9958 |
| Precision | 100.00% | 100.00% |
| Recall | 97.25% | 95.41% |

The Random Forest confusion matrix is 26 true negatives, 0 false positives, 3 false negatives, and 106 true positives. These values describe this generated synthetic split and must not be represented as evidence of clinical performance.

See test_report.json and training_report.json for the full recorded metrics and curves.

## Vessel segmentation

The trained U-Net checkpoint report records ARCADE with 900 training, 100 validation, and 300 held-out test images. The held-out test Dice is 0.5709 and IoU is 0.3995. This is a separate dataset and task from the 675-case synthetic stenosis benchmark above.

See arcade_model_validation_report.json and segmentation_dl_report.json for the recorded segmentation metrics and history. The ARCADE image data itself is not included in this public source repository; follow the original dataset terms.

## Interpretation

Do not merge these metrics into one benchmark, imply external clinical validation, or guarantee performance on a new dataset or site. Segmentation Dice/IoU are overlap metrics; stenosis accuracy/ROC AUC/precision/recall are classification metrics. All outputs require appropriate expert review.
