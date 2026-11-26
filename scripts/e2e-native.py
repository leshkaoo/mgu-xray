#!/usr/bin/env python3
"""Reuse the synthetic REALITY fixture through the real native UI controller."""
import importlib.util
import os
from pathlib import Path
import tempfile

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('reality_fixture', root / 'e2e-local.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
fixture.SUPERVISOR = root / 'native-fixture.cjs'
fixture.TEST_PARENT_LOSS = True
fixture.TEST_NATIVE_BACKGROUND = True
with tempfile.TemporaryDirectory(prefix='mgu-native-suite-') as temp:
    os.environ['MGU_FIXTURE_TMPDIR'] = temp
    fixture.main()
