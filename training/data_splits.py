"""Deterministic, severity-stratified splits shared by training and testing."""

import numpy as np
from sklearn.model_selection import train_test_split


def stratified_split_labels(frame, seed=42):
    """Return aligned split labels (70% train, 10% validation, 20% test)."""
    indices = np.arange(len(frame))
    strata = frame["severity"].astype(str).to_numpy()
    train_validation, test = train_test_split(
        indices, test_size=0.20, random_state=seed, stratify=strata
    )
    train, validation = train_test_split(
        train_validation,
        test_size=0.125,
        random_state=seed,
        stratify=strata[train_validation],
    )
    labels = np.empty(len(frame), dtype=object)
    labels[train] = "train"
    labels[validation] = "val"
    labels[test] = "test"
    return labels
