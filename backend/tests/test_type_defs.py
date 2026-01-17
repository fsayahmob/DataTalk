"""Tests pour type_defs.py - Conversion Pandas/Numpy → JSON."""

import json

import numpy as np
import pandas as pd

from type_defs import convert_df_to_json, convert_pandas_value


class TestConvertPandasValue:
    """Tests de convert_pandas_value."""

    def test_nan_returns_none(self) -> None:
        """NaN Python et Numpy retournent None."""
        assert convert_pandas_value(float("nan")) is None
        assert convert_pandas_value(np.nan) is None

    def test_inf_returns_none(self) -> None:
        """Inf et -Inf retournent None (non JSON-sérialisable)."""
        assert convert_pandas_value(float("inf")) is None
        assert convert_pandas_value(float("-inf")) is None
        assert convert_pandas_value(np.inf) is None
        assert convert_pandas_value(-np.inf) is None

    def test_numpy_inf_returns_none(self) -> None:
        """np.float64 avec inf retourne None."""
        assert convert_pandas_value(np.float64("inf")) is None
        assert convert_pandas_value(np.float64("-inf")) is None

    def test_normal_float_unchanged(self) -> None:
        """Les floats normaux sont préservés."""
        assert convert_pandas_value(3.14) == 3.14
        assert convert_pandas_value(0.0) == 0.0
        assert convert_pandas_value(-42.5) == -42.5

    def test_numpy_float_converted(self) -> None:
        """np.float64 est converti en Python float."""
        result = convert_pandas_value(np.float64(3.14))
        assert result == 3.14
        assert isinstance(result, float)

    def test_numpy_int_converted(self) -> None:
        """np.int64 est converti en Python int."""
        result = convert_pandas_value(np.int64(42))
        assert result == 42
        assert isinstance(result, int)

    def test_timestamp_to_iso(self) -> None:
        """Timestamp Pandas est converti en ISO string."""
        ts = pd.Timestamp("2024-01-15 10:30:00")
        result = convert_pandas_value(ts)
        assert "2024-01-15" in result
        assert "10:30:00" in result

    def test_nat_returns_none(self) -> None:
        """NaT (Not a Time) retourne None."""
        assert convert_pandas_value(pd.NaT) is None


class TestConvertDfToJson:
    """Tests de convert_df_to_json."""

    def test_df_with_inf_is_json_serializable(self) -> None:
        """DataFrame avec inf/nan est JSON-sérialisable après conversion."""
        df = pd.DataFrame(
            {
                "normal": [1.0, 2.0, 3.0],
                "with_inf": [1.0, np.inf, -np.inf],
                "with_nan": [np.nan, 2.0, 3.0],
            }
        )
        result = convert_df_to_json(df)

        # Doit être JSON-sérialisable sans exception
        json_str = json.dumps(result)
        assert json_str is not None

        # Vérifier les valeurs
        assert result[0]["normal"] == 1.0
        assert result[1]["with_inf"] is None  # inf → None
        assert result[2]["with_inf"] is None  # -inf → None
        assert result[0]["with_nan"] is None  # nan → None
        assert result[1]["with_nan"] == 2.0

    def test_empty_df(self) -> None:
        """DataFrame vide retourne liste vide."""
        df = pd.DataFrame()
        result = convert_df_to_json(df)
        assert result == []

    def test_df_with_timestamps(self) -> None:
        """DataFrame avec timestamps est correctement converti."""
        df = pd.DataFrame(
            {
                "date": pd.to_datetime(["2024-01-15", "2024-01-16"]),
                "value": [1, 2],
            }
        )
        result = convert_df_to_json(df)

        # Les dates sont converties en strings
        assert "2024-01-15" in str(result[0]["date"])
        assert result[0]["value"] == 1
