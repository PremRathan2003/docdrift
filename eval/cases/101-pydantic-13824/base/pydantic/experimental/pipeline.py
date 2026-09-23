) -> cs.CoreSchema:
    if tp is _FieldTypeMarker:
        return cs.chain_schema([s, handler(source_type)]) if s else handler(source_type)

    if strict:
        tp = Annotated[tp, Strict()]  # type: ignore

    if s and s['type'] == 'any':
        return handler(tp)
    else:
        return cs.chain_schema([s, handler(tp)]) if s else handler(tp)


def _apply_transform(
    s: cs.CoreSchema | None, func: Callable[[Any], Any], handler: GetCoreSchemaHandler
) -> cs.CoreSchema:
    if s is None:
        return cs.no_info_plain_validator_function(func)

    if s['type'] == 'str':
        if func is str.strip:
            s = s.copy()
            s['strip_whitespace'] = True
            return s
        elif func is str.lower:
            s = s.copy()
            s['to_lower'] = True
            return s
        elif func is str.upper:
            s = s.copy()
            s['to_upper'] = True
            return s

    return cs.no_info_after_validator_function(func, s)


# Core schema types with native support for the `gt`/`ge`/`lt`/`le` constraints:
_ORDERING_SCHEMA_TYPES = frozenset({'int', 'float', 'decimal', 'fraction', 'date', 'time', 'datetime', 'timedelta'})
# Core schema types with native support for the `min_length`/`max_length` constraints:
_LENGTH_SCHEMA_TYPES = frozenset(
    {'str', 'bytes', 'list', 'tuple', 'set', 'frozenset', 'dict', 'frozendict', 'ordered-dict', 'generator'}
)


def _apply_constraint(  # noqa: C901
    s: cs.CoreSchema | None, constraint: _ConstraintAnnotation
) -> cs.CoreSchema:
    """Apply a single constraint to a schema."""
    # No casting of the constraints is necessary, as pydantic-core does it
    # when building the validator from the core schema:
    if isinstance(constraint, annotated_types.Gt):
        gt = constraint.gt
        if s and s['type'] in _ORDERING_SCHEMA_TYPES:
            s = s.copy()
            s['gt'] = gt  # pyright: ignore[reportGeneralTypeIssues]
        else:

            def check_gt(v: Any) -> bool:
                return v > gt

            s = _check_func(check_gt, f'> {gt}', s)
    elif isinstance(constraint, annotated_types.Ge):
        ge = constraint.ge
        if s and s['type'] in _ORDERING_SCHEMA_TYPES:
            s = s.copy()
            s['ge'] = ge  # pyright: ignore[reportGeneralTypeIssues]
        else:

            def check_ge(v: Any) -> bool:
                return v >= ge

            s = _check_func(check_ge, f'>= {ge}', s)
    elif isinstance(constraint, annotated_types.Lt):
        lt = constraint.lt
        if s and s['type'] in _ORDERING_SCHEMA_TYPES:
            s = s.copy()
            s['lt'] = lt  # pyright: ignore[reportGeneralTypeIssues]
        else:

            def check_lt(v: Any) -> bool:
                return v < lt
