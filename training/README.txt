Infosys Artery AI - Model Training and Evaluation

train.py fits the image-only QCA feature classifiers and measures the classical
segmentation baseline on a shared severity-stratified train/validation/test
split. test.py evaluates the held-out split. compare_segmentation.py compares
segmentation algorithms against supplied image masks. Ground-truth masks and
centerlines are never inputs to classifier inference.

Reports are generated from the current run:
- training_report.json
- test_report.json
- segmentation_comparison.json
- TEST_BENCHMARK_SUMMARY.md
- evaluation_plots.png and confusion_matrix.png

Install optional dependencies from requirements_segmentation.txt to train
U-Net and U-Net++ models with train_segmentation_dl.py. The model comparison
and test reports include evaluated case counts, metrics, and scope limitations.
The supplied data and these results are for engineering evaluation, not
prospective clinical validation or standalone medical diagnosis.
