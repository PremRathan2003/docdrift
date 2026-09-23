BYTES_CONSTRAINTS = {*LENGTH_CONSTRAINTS, *STRICT}

LIST_CONSTRAINTS = {*LENGTH_CONSTRAINTS, *STRICT, *FAIL_FAST}
TUPLE_CONSTRAINTS = {*LENGTH_CONSTRAINTS, *STRICT, *FAIL_FAST}
SET_CONSTRAINTS = {*LENGTH_CONSTRAINTS, *STRICT, *FAIL_FAST}
DICT_CONSTRAINTS = {*LENGTH_CONSTRAINTS, *STRICT, *FAIL_FAST}
GENERATOR_CONSTRAINTS = LENGTH_CONSTRAINTS
SEQUENCE_CONSTRAINTS = {*LENGTH_CONSTRAINTS, *FAIL_FAST}

FLOAT_CONSTRAINTS = {*NUMERIC_CONSTRAINTS, *ALLOW_INF_NAN, *STRICT}
DECIMAL_CONSTRAINTS = {'max_digits', 'decimal_places', *FLOAT_CONSTRAINTS}
FRACTION_CONSTRAINTS = {*INEQUALITY, *STRICT}
INT_CONSTRAINTS = {*NUMERIC_CONSTRAINTS, *STRICT}
BOOL_CONSTRAINTS = STRICT
UUID_CONSTRAINTS = STRICT

DATE_TIME_CONSTRAINTS = {*INEQUALITY, *STRICT}
LAX_OR_STRICT_CONSTRAINTS = STRICT
ENUM_CONSTRAINTS = STRICT
COMPLEX_CONSTRAINTS = STRICT

UNION_CONSTRAINTS = {'union_mode'}
URL_CONSTRAINTS = {
    'max_length',
    'allowed_schemes',
    'host_required',
    'default_host',
    'default_port',
    'default_path',
    *STRICT,
}

CONSTRAINTS_TO_ALLOWED_SCHEMAS: dict[str, set[str]] = defaultdict(set)

constraint_schema_pairings: list[tuple[set[str], tuple[str, ...]]] = [
    (STR_CONSTRAINTS, ('str',)),
    (BYTES_CONSTRAINTS, ('bytes',)),
    (LIST_CONSTRAINTS, ('list', 'deque')),
    (TUPLE_CONSTRAINTS, ('tuple',)),
    (SET_CONSTRAINTS, ('set', 'frozenset')),
    (DICT_CONSTRAINTS, ('dict', 'frozendict', 'ordered-dict', 'counter')),
    (GENERATOR_CONSTRAINTS, ('generator',)),
    (FLOAT_CONSTRAINTS, ('float',)),
    (INT_CONSTRAINTS, ('int',)),
    (DATE_TIME_CONSTRAINTS, ('date', 'time', 'datetime', 'timedelta')),
    (STRICT, ('typed-dict', 'model')),
    (UNION_CONSTRAINTS, ('union',)),
    (URL_CONSTRAINTS, ('url', 'multi-host-url')),
    (BOOL_CONSTRAINTS, ('bool',)),
    (UUID_CONSTRAINTS, ('uuid',)),
    (LAX_OR_STRICT_CONSTRAINTS, ('lax-or-strict',)),
    (ENUM_CONSTRAINTS, ('enum',)),
    (DECIMAL_CONSTRAINTS, ('decimal',)),
    (COMPLEX_CONSTRAINTS, ('complex',)),
    (FRACTION_CONSTRAINTS, ('fraction',)),
]

for constraints, schemas in constraint_schema_pairings:
    for c in constraints:
        CONSTRAINTS_TO_ALLOWED_SCHEMAS[c].update(schemas)


def as_jsonable_value(v: Any) -> Any:
    if type(v) not in (int, str, float, bytes, bool, type(None)):
        return to_jsonable_python(v)
    return v


def expand_grouped_metadata(annotations: Iterable[Any]) -> Iterable[Any]:
    """Expand the annotations.

    Args:
        annotations: An iterable of annotations.

    Returns:
        An iterable of expanded annotations.

    Example:
        ```python
        from annotated_types import Ge, Len

