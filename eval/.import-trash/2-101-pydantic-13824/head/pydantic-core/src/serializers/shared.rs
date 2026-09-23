        super::type_serializers::other::ChainBuilder;
        super::type_serializers::other::CustomErrorBuilder;
        super::type_serializers::other::CallBuilder;
        super::type_serializers::other::LaxOrStrictBuilder;
        super::type_serializers::other::ArgumentsBuilder;
        super::type_serializers::other::IsInstanceBuilder;
        super::type_serializers::other::IsSubclassBuilder;
        super::type_serializers::other::CallableBuilder;
        super::type_serializers::definitions::DefinitionsSerializerBuilder;
        super::type_serializers::dataclass::DataclassArgsBuilder;
        super::type_serializers::function::FunctionBeforeSerializerBuilder;
        super::type_serializers::function::FunctionAfterSerializerBuilder;
        super::type_serializers::function::FunctionPlainSerializerBuilder;
        super::type_serializers::function::FunctionWrapSerializerBuilder;
        super::type_serializers::model::ModelFieldsBuilder;
    }
    // `both` means the struct is added to both the `CombinedSerializer` enum and the match statement in
    // `find_serializer` so they can be used via a `type` str.
    both: {
        None: super::type_serializers::simple::NoneSerializer;
        Nullable: super::type_serializers::nullable::NullableSerializer;
        Int: super::type_serializers::simple::IntSerializer;
        Bool: super::type_serializers::simple::BoolSerializer;
        Float: super::type_serializers::float::FloatSerializer;
        Decimal: super::type_serializers::decimal::DecimalSerializer;
        Fraction: super::type_serializers::fraction::FractionSerializer;
        Str: super::type_serializers::string::StrSerializer;
        Bytes: super::type_serializers::bytes::BytesSerializer;
        Datetime: super::type_serializers::datetime_etc::DatetimeSerializer;
        TimeDelta: super::type_serializers::timedelta::TimeDeltaSerializer;
        Date: super::type_serializers::datetime_etc::DateSerializer;
        Time: super::type_serializers::datetime_etc::TimeSerializer;
        List: super::type_serializers::list::ListSerializer;
        Deque: super::type_serializers::deque::DequeSerializer;
        Set: super::type_serializers::set_frozenset::SetSerializer;
        FrozenSet: super::type_serializers::set_frozenset::FrozenSetSerializer;
        Generator: super::type_serializers::generator::GeneratorSerializer;
        Dict: super::type_serializers::dict::DictSerializer;
        FrozenDict: super::type_serializers::frozendict::FrozenDictSerializer;
        OrderedDict: super::type_serializers::ordered_dict::OrderedDictSerializer;
        Counter: super::type_serializers::counter::CounterSerializer;
        Model: super::type_serializers::model::ModelSerializer;
        Dataclass: super::type_serializers::dataclass::DataclassSerializer;
        Url: super::type_serializers::url::UrlSerializer;
        MultiHostUrl: super::type_serializers::url::MultiHostUrlSerializer;
        Uuid: super::type_serializers::uuid::UuidSerializer;
        Any: super::type_serializers::any::AnySerializer;
        Format: super::type_serializers::format::FormatSerializer;
        ToString: super::type_serializers::format::ToStringSerializer;
        WithDefault: super::type_serializers::with_default::WithDefaultSerializer;
        Json: super::type_serializers::json::JsonSerializer;
        JsonOrPython: super::type_serializers::json_or_python::JsonOrPythonSerializer;
        Union: super::type_serializers::union::UnionSerializer;
        TaggedUnion: super::type_serializers::union::TaggedUnionSerializer;
        Literal: super::type_serializers::literal::LiteralSerializer;
        MissingSentinel: super::type_serializers::missing_sentinel::MissingSentinelSerializer;
        Ellipsis: super::type_serializers::ellipsis::EllipsisSerializer;
        Enum: super::type_serializers::enum_::EnumSerializer;
        Recursive: super::type_serializers::definitions::DefinitionRefSerializer;
        Tuple: super::type_serializers::tuple::TupleSerializer;
        Complex: super::type_serializers::complex::ComplexSerializer;
        TypedDict: super::type_serializers::typed_dict::TypedDictSerializer;
        NamedTuple: super::type_serializers::named_tuple::NamedTupleSerializer;
    }
}

impl CombinedSerializer {
    fn _build(
        schema: &Bound<'_, PyDict>,
        config: Option<&Bound<'_, PyDict>>,
        definitions: &mut DefinitionsBuilder<Arc<CombinedSerializer>>,
        use_prebuilt: bool,
    ) -> PyResult<Arc<CombinedSerializer>> {
        let py = schema.py();
        let type_key = intern!(py, "type");

        if let Some(ser_schema) = schema.get_as::<Bound<'_, PyDict>>(intern!(py, "serialization"))? {
            let op_ser_type: Option<Bound<'_, PyString>> = ser_schema.get_as(type_key)?;
            match op_ser_type.as_ref().map(|py_str| py_str.to_str()).transpose()? {
                Some("function-plain") => {
                    // `function-plain` is a special case, not included in `find_serializer` since it means
… trimmed for the evaluation dataset …
        config: Option<&Bound<'_, PyDict>>,
        definitions: &mut DefinitionsBuilder<Arc<CombinedSerializer>>,
    ) -> PyResult<Arc<CombinedSerializer>> {
        // Read use_prebuilt from the definitions builder - this ensures all nested
        // serializers respect the same setting as the top-level build
        let use_prebuilt = definitions.use_prebuilt();
        let serializer = Self::_build(schema, config, definitions, use_prebuilt)?;
        Self::maybe_wrap_in_polymorphism_trampoline(serializer, schema)
    }
}

// Implemented by hand because `enum_dispatch` fails with a proc macro compile error =/
impl PyGcTraverse for CombinedSerializer {
    fn py_gc_traverse(&self, visit: &PyVisit<'_>) -> Result<(), PyTraverseError> {
        match self {
            CombinedSerializer::Function(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::FunctionWrap(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Fields(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Prebuilt(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::None(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Nullable(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Int(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Bool(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Float(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Decimal(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Fraction(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Str(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Bytes(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Datetime(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::TimeDelta(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Date(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Time(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::List(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Deque(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Set(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::FrozenSet(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Generator(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Dict(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::FrozenDict(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::OrderedDict(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Counter(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Model(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Dataclass(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Url(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::MultiHostUrl(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Any(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Format(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::ToString(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::WithDefault(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Json(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::JsonOrPython(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Union(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::TaggedUnion(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Literal(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::MissingSentinel(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Ellipsis(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Enum(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Recursive(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Tuple(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Uuid(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::Complex(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::TypedDict(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::NamedTuple(inner) => inner.py_gc_traverse(visit),
            CombinedSerializer::PolymorphismTrampoline(inner) => inner.py_gc_traverse(visit),
        }
    }
}

#[enum_dispatch(CombinedSerializer)]
pub(crate) trait TypeSerializer: Send + Sync + Debug {
    fn to_python<'py>(&self, value: &Bound<'py, PyAny>, state: &mut SerializationState<'py>) -> PyResult<Py<PyAny>>;

    fn json_key<'a, 'py>(
        &self,
        key: &'a Bound<'py, PyAny>,
        state: &mut SerializationState<'py>,
    ) -> PyResult<Cow<'a, str>>;

    fn invalid_as_json_key<'a, 'py>(
        &self,
        key: &'a Bound<'py, PyAny>,
