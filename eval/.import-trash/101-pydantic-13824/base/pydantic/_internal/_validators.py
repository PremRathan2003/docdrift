def decimal_places_validator(x: Any, decimal_places: Any) -> Any:
    try:
        (decimal_places_, _), (normalized_decimal_places, _) = _extract_decimal_digits_info(x)
        if (decimal_places_ > decimal_places) and (normalized_decimal_places > decimal_places):
            raise PydanticKnownError(
                'decimal_max_places',
                {'decimal_places': decimal_places},
            )
        return x
    except TypeError:
        raise TypeError(f"Unable to apply constraint 'decimal_places' to supplied value {x}")


def defaultdict_validator(
    input_value: Any, handler: core_schema.ValidatorFunctionWrapHandler, default_default_factory: Callable[[], Any]
) -> collections.defaultdict[Any, Any]:
    if isinstance(input_value, collections.defaultdict):
        default_factory = input_value.default_factory
        return collections.defaultdict(default_factory, handler(input_value))
    else:
        return collections.defaultdict(default_default_factory, handler(input_value))


_defaultdict_allowed_default_types: dict[type[Any], type[Any]] = {
    float: float,
    int: int,
    str: str,
    bool: bool,
    tuple: tuple,
    collections.abc.Sequence: tuple,
    collections.abc.MutableSequence: list,
    list: list,
    set: set,
    collections.abc.MutableSet: set,
    frozenset: frozenset,
    collections.abc.Set: frozenset,
    dict: dict,
    collections.abc.Mapping: dict,
    collections.abc.MutableMapping: dict,
    collections.OrderedDict: collections.OrderedDict,
}

if sys.version_info >= (3, 15):
    _defaultdict_allowed_default_types[collections.abc.Mapping] = frozendict  # noqa: F821
    _defaultdict_allowed_default_types[frozendict] = frozendict  # noqa: F821


def get_defaultdict_default_default_factory(values_source_type: Any) -> Callable[[], Any]:
    FieldInfo = import_cached_field_info()

    values_type_origin = get_origin(values_source_type)

    def infer_default() -> Callable[[], Any]:
        values_type = values_type_origin or values_source_type
        instructions = 'set using `DefaultDict[..., Annotated[..., Field(default_factory=...)]]`'
        if typing_objects.is_typevar(values_type):

            def type_var_default_factory() -> None:
                raise RuntimeError(
                    'Generic defaultdict cannot be used without a concrete value type or an'
                    ' explicit default factory, ' + instructions
                )

            return type_var_default_factory
        elif values_type not in _defaultdict_allowed_default_types:
            # a somewhat subjective set of types that have reasonable default values
            allowed_msg = ', '.join([t.__name__ for t in _defaultdict_allowed_default_types.keys()])
            raise PydanticSchemaGenerationError(
                f'Unable to infer a default factory for values of type {values_source_type}.'
                f' Only {allowed_msg} are supported, other types require an explicit default factory'
                ' ' + instructions
            )
        return _defaultdict_allowed_default_types[values_type]

    # Assume Annotated[..., Field(...)]
    if typing_objects.is_annotated(values_type_origin):
        field_info = next((v for v in get_args(values_source_type) if isinstance(v, FieldInfo)), None)
    else:
        field_info = None
    if field_info and field_info.default_factory:
… trimmed for the evaluation dataset …
    else:
        default_default_factory = infer_default()
    return default_default_factory


def validate_str_is_valid_iana_tz(value: Any, /) -> ZoneInfo:
    if isinstance(value, ZoneInfo):
        return value
    try:
        return ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise PydanticCustomError('zoneinfo_str', 'invalid timezone: {value}', {'value': value})


NUMERIC_VALIDATOR_LOOKUP: dict[str, Callable] = {
    'gt': greater_than_validator,
    'ge': greater_than_or_equal_validator,
    'lt': less_than_validator,
    'le': less_than_or_equal_validator,
    'multiple_of': multiple_of_validator,
    'min_length': min_length_validator,
    'max_length': max_length_validator,
    'max_digits': max_digits_validator,
    'decimal_places': decimal_places_validator,
}

IpType: TypeAlias = IPv4Address | IPv6Address | IPv4Network | IPv6Network | IPv4Interface | IPv6Interface

IP_VALIDATOR_LOOKUP: dict[type[IpType], Callable] = {
    IPv4Address: ip_v4_address_validator,
    IPv6Address: ip_v6_address_validator,
    IPv4Network: ip_v4_network_validator,
    IPv6Network: ip_v6_network_validator,
    IPv4Interface: ip_v4_interface_validator,
    IPv6Interface: ip_v6_interface_validator,
}

MAPPING_ORIGIN_MAP: dict[Any, Any] = {
    typing.DefaultDict: collections.defaultdict,  # noqa: UP006
    collections.defaultdict: collections.defaultdict,
    typing.Counter: collections.Counter,
    collections.Counter: collections.Counter,
    # this doesn't handle subclasses of these
    typing.Mapping: dict,
    typing.MutableMapping: dict,
    # parametrized typing.{Mutable}Mapping creates one of these
    collections.abc.Mapping: dict,
    collections.abc.MutableMapping: dict,
}
