    def config(self) -> CoreConfig | None:
        """The CoreConfig that applies to this validation."""
        ...

    @property
    def mode(self) -> Literal['python', 'json']:
        """The type of input data we are currently validating."""
        ...

    @property
    def data(self) -> dict[str, Any]:
        """The data being validated for this model."""
        ...

    @property
    def field_name(self) -> str | None:
        """
        The name of the current field being validated if this validator is
        attached to a model field.
        """
        ...


ExpectedSerializationTypes: TypeAlias = Literal[
    'none',
    'int',
    'bool',
    'float',
    'str',
    'bytes',
    'bytearray',
    'list',
    'deque',
    'tuple',
    'set',
    'frozenset',
    'generator',
    'dict',
    'frozendict',
    'ordered-dict',
    'counter',
    'datetime',
    'date',
    'time',
    'timedelta',
    'url',
    'multi-host-url',
    'json',
    'uuid',
    'any',
]


class SimpleSerSchema(TypedDict, total=False):
    type: Required[ExpectedSerializationTypes]


def simple_ser_schema(type: ExpectedSerializationTypes) -> SimpleSerSchema:
    """
    Returns a schema for serialization with a custom type.

    Note that any core schema can be used as a serialization schema, e.g. `int_schema()`
    is equivalent to `simple_ser_schema('int')`.

    Args:
        type: The type to use for serialization
    """
    return SimpleSerSchema(type=type)


# (input_value: Any, /) -> Any
GeneralPlainNoInfoSerializerFunction: TypeAlias = Callable[[Any], Any]
# (input_value: Any, info: FieldSerializationInfo, /) -> Any
GeneralPlainInfoSerializerFunction: TypeAlias = Callable[[Any, SerializationInfo[Any]], Any]
# (model: Any, input_value: Any, /) -> Any
FieldPlainNoInfoSerializerFunction: TypeAlias = Callable[[Any, Any], Any]
# (model: Any, input_value: Any, info: FieldSerializationInfo, /) -> Any
FieldPlainInfoSerializerFunction: TypeAlias = Callable[[Any, Any, FieldSerializationInfo[Any]], Any]
SerializerFunction: TypeAlias = (
    GeneralPlainNoInfoSerializerFunction
    | GeneralPlainInfoSerializerFunction
… trimmed for the evaluation dataset …

    ```py
    from collections import OrderedDict

    from pydantic_core import SchemaValidator, core_schema

    schema = core_schema.ordered_dict_schema(
        keys_schema=core_schema.str_schema(), values_schema=core_schema.int_schema()
    )
    v = SchemaValidator(schema)
    assert v.validate_python({'a': '1', 'b': 2}) == OrderedDict({'a': 1, 'b': 2})
    ```

    In lax mode, any mapping is accepted and converted to an `OrderedDict`.

    Args:
        keys_schema: The value must be an `OrderedDict` with keys that match this schema
        values_schema: The value must be an `OrderedDict` with values that match this schema
        min_length: The value must be an `OrderedDict` with at least this many items
        max_length: The value must be an `OrderedDict` with at most this many items
        fail_fast: Stop validation on the first error
        strict: The value must be an `OrderedDict` instance
        ref: optional unique identifier of the schema, used to reference the schema in other places
        metadata: Any other information you want to include with the schema, not used by pydantic-core
        serialization: Custom serialization schema
    """
    return _dict_not_none(
        type='ordered-dict',
        keys_schema=keys_schema,
        values_schema=values_schema,
        min_length=min_length,
        max_length=max_length,
        fail_fast=fail_fast,
        strict=strict,
        ref=ref,
        metadata=metadata,
        serialization=serialization,
    )


class CounterSchema(TypedDict, total=False):
    type: Required[Literal['counter']]
    keys_schema: CoreSchema  # default: AnySchema
    values_schema: CoreSchema  # default: AnySchema
    min_length: int
    max_length: int
    fail_fast: bool
    strict: bool
    ref: str
    metadata: dict[str, Any]
    serialization: IncExDictOrElseSerSchema


def counter_schema(
    keys_schema: CoreSchema | None = None,
    values_schema: CoreSchema | None = None,
    *,
    min_length: int | None = None,
    max_length: int | None = None,
    fail_fast: bool | None = None,
    strict: bool | None = None,
    ref: str | None = None,
    metadata: dict[str, Any] | None = None,
    serialization: SerSchema | None = None,
) -> CounterSchema:
    """
    Returns a schema that matches a [`collections.Counter`][] value, e.g.:

    ```py
    from collections import Counter

    from pydantic_core import SchemaValidator, core_schema

    schema = core_schema.counter_schema(
        keys_schema=core_schema.str_schema(), values_schema=core_schema.int_schema()
    )
    v = SchemaValidator(schema)
    assert v.validate_python({'a': '1', 'b': 2}) == Counter({'a': 1, 'b': 2})
    ```

    In lax mode, any mapping is accepted and converted to a `Counter`.

    Args:
        keys_schema: The value must be a `Counter` with keys that match this schema
        values_schema: The value must be a `Counter` with values that match this schema
        min_length: The value must be a `Counter` with at least this many items
        max_length: The value must be a `Counter` with at most this many items
        fail_fast: Stop validation on the first error
        strict: The value must be a `Counter` instance
        ref: optional unique identifier of the schema, used to reference the schema in other places
        metadata: Any other information you want to include with the schema, not used by pydantic-core
        serialization: Custom serialization schema
    """
    return _dict_not_none(
        type='counter',
        keys_schema=keys_schema,
        values_schema=values_schema,
        min_length=min_length,
        max_length=max_length,
        fail_fast=fail_fast,
        strict=strict,
        ref=ref,
        metadata=metadata,
        serialization=serialization,
    )


# (input_value: Any, /) -> Any
NoInfoValidatorFunction: TypeAlias = Callable[[Any], Any]


class NoInfoValidatorFunctionSchema(TypedDict):
    type: Literal['no-info']
    function: NoInfoValidatorFunction


# (input_value: Any, info: ValidationInfo, /) -> Any
WithInfoValidatorFunction: TypeAlias = Callable[[Any, ValidationInfo[Any]], Any]


class WithInfoValidatorFunctionSchema(TypedDict, total=False):
    type: Required[Literal['with-info']]
    function: Required[WithInfoValidatorFunction]
    field_name: str  # deprecated


ValidationFunction: TypeAlias = NoInfoValidatorFunctionSchema | WithInfoValidatorFunctionSchema


class _ValidatorFunctionSchema(TypedDict, total=False):
    function: Required[ValidationFunction]
    schema: Required[CoreSchema]
    ref: str
    metadata: dict[str, Any]
    serialization: SerSchema


class BeforeValidatorFunctionSchema(_ValidatorFunctionSchema, total=False):
    type: Required[Literal['function-before']]
    json_schema_input_schema: CoreSchema


def no_info_before_validator_function(
    function: NoInfoValidatorFunction,
    schema: CoreSchema,
    *,
    ref: str | None = None,
… trimmed for the evaluation dataset …
    return _dict_not_none(
        type='definition-ref', schema_ref=schema_ref, ref=ref, metadata=metadata, serialization=serialization
    )


MYPY = False
# See https://github.com/python/mypy/issues/14034 for details, in summary mypy is extremely slow to process this
# union which kills performance not just for pydantic, but even for code using pydantic
if not MYPY:
    CoreSchema: TypeAlias = (
        InvalidSchema
        | AnySchema
        | NoneSchema
        | BoolSchema
        | IntSchema
        | FloatSchema
        | DecimalSchema
        | FractionSchema
        | StringSchema
        | BytesSchema
        | DateSchema
        | TimeSchema
        | DatetimeSchema
        | TimedeltaSchema
        | LiteralSchema
        | MissingSentinelSchema
        | EllipsisSchema
        | EnumSchema
        | IsInstanceSchema
        | IsSubclassSchema
        | CallableSchema
        | ListSchema
        | DequeSchema
        | TupleSchema
        | SetSchema
        | FrozenSetSchema
        | GeneratorSchema
        | DictSchema
        | FrozenDictSchema
        | OrderedDictSchema
        | CounterSchema
        | AfterValidatorFunctionSchema
        | BeforeValidatorFunctionSchema
        | WrapValidatorFunctionSchema
        | PlainValidatorFunctionSchema
        | WithDefaultSchema
        | NullableSchema
        | UnionSchema
        | TaggedUnionSchema
        | ChainSchema
        | LaxOrStrictSchema
        | JsonOrPythonSchema
        | TypedDictSchema
        | ModelFieldsSchema
        | ModelSchema
        | DataclassArgsSchema
        | DataclassSchema
        | NamedTupleSchema
        | ArgumentsSchema
        | ArgumentsV3Schema
        | CallSchema
        | CustomErrorSchema
        | JsonSchema
        | UrlSchema
        | MultiHostUrlSchema
        | DefinitionsSchema
        | DefinitionReferenceSchema
        | UuidSchema
        | ComplexSchema
    )
elif False:
    CoreSchema: TypeAlias = Mapping[str, Any]


# to update this, call `pytest -k test_core_schema_type_literal` and copy the output
CoreSchemaType: TypeAlias = Literal[
    'invalid',
    'any',
    'none',
    'bool',
    'int',
    'float',
    'decimal',
    'fraction',
    'str',
    'bytes',
    'date',
    'time',
    'datetime',
    'timedelta',
    'literal',
    'missing-sentinel',
    'ellipsis',
    'enum',
    'is-instance',
    'is-subclass',
    'callable',
    'list',
    'deque',
    'tuple',
    'set',
    'frozenset',
    'generator',
    'dict',
    'frozendict',
    'ordered-dict',
    'counter',
    'function-after',
    'function-before',
    'function-wrap',
    'function-plain',
    'default',
    'nullable',
    'union',
    'tagged-union',
    'chain',
    'lax-or-strict',
    'json-or-python',
    'typed-dict',
    'model-fields',
    'model',
    'dataclass-args',
    'dataclass',
    'named-tuple',
    'arguments',
    'arguments-v3',
    'call',
    'custom-error',
    'json',
    'url',
    'multi-host-url',
    'definitions',
    'definition-ref',
    'uuid',
    'complex',
]

CoreSchemaFieldType: TypeAlias = Literal[
    'model-field', 'dataclass-field', 'typed-dict-field', 'named-tuple-field', 'computed-field'
]


# used in _pydantic_core/__init__.pyi::PydanticKnownError
# to update this, call `pytest -k test_all_errors` and copy the output
ErrorType: TypeAlias = Literal[
    'no_such_attribute',
    'json_invalid',
    'json_type',
    'needs_python_object',
    'recursion_loop',
    'missing',
    'frozen_field',
    'frozen_instance',
    'extra_forbidden',
    'invalid_key',
    'get_attribute_error',
    'model_type',
    'model_attributes_type',
    'dataclass_type',
    'dataclass_exact_type',
    'named_tuple_type',
    'default_factory_not_called',
    'none_required',
    'greater_than',
    'greater_than_equal',
    'less_than',
    'less_than_equal',
    'multiple_of',
    'finite_number',
    'too_short',
    'too_long',
    'iterable_type',
    'iteration_error',
    'string_type',
    'string_unicode',
    'string_too_short',
    'string_too_long',
    'string_pattern_mismatch',
    'string_not_ascii',
    'enum',
    'dict_type',
    'frozen_dict_type',
    'ordered_dict_type',
    'counter_type',
    'mapping_type',
    'list_type',
    'deque_type',
    'tuple_type',
    'set_type',
    'set_item_not_hashable',
    'bool_type',
    'bool_parsing',
    'int_type',
    'int_parsing',
    'int_parsing_size',
    'int_from_float',
    'float_type',
    'float_parsing',
    'bytes_type',
    'bytes_too_short',
    'bytes_too_long',
    'bytes_invalid_encoding',
    'value_error',
    'assertion_error',
    'literal_error',
    'missing_sentinel_error',
    'ellipsis_error',
    'date_type',
    'date_parsing',
    'date_from_datetime_parsing',
    'date_from_datetime_inexact',
    'date_past',
    'date_future',
    'time_type',
    'time_parsing',
    'datetime_type',
    'datetime_parsing',
    'datetime_object_invalid',
    'datetime_from_date_parsing',
    'datetime_past',
    'datetime_future',
    'timezone_naive',
    'timezone_aware',
    'timezone_offset',
