    TooShort {
        field_type: {ctx_type: String, ctx_fn: field_from_context},
        min_length: {ctx_type: usize, ctx_fn: field_from_context},
        actual_length: {ctx_type: usize, ctx_fn: field_from_context},
    },
    TooLong {
        field_type: {ctx_type: String, ctx_fn: field_from_context},
        max_length: {ctx_type: usize, ctx_fn: field_from_context},
        actual_length: {ctx_type: Option<usize>, ctx_fn: field_from_context},
    },
    // ---------------------
    // generic collection and iteration errors
    IterableType {},
    IterationError {
        error: {ctx_type: String, ctx_fn: field_from_context},
    },
    // ---------------------
    // string errors
    StringType {},
    StringUnicode {},
    StringTooShort {
        min_length: {ctx_type: usize, ctx_fn: field_from_context},
    },
    StringTooLong {
        max_length: {ctx_type: usize, ctx_fn: field_from_context},
    },
    StringPatternMismatch {
        pattern: {ctx_type: String, ctx_fn: field_from_context},
    },
    StringNotAscii {},
    // ---------------------
    // enum errors
    Enum {
        expected: {ctx_type: String, ctx_fn: field_from_context},
    },
    // ---------------------
    // dict errors
    DictType {},
    FrozenDictType {},
    OrderedDictType {},
    CounterType {},
    MappingType {
        error: {ctx_type: Cow<'static, str>, ctx_fn: cow_field_from_context<String, _>},
    },
    // ---------------------
    // list errors
    ListType {},
    // ---------------------
    // deque errors
    DequeType {},
    // ---------------------
    // tuple errors
    TupleType {},
    // ---------------------
    // set errors
    SetType {},
    SetItemNotHashable {},
    // ---------------------
    // bool errors
    BoolType {},
    BoolParsing {},
    // ---------------------
    // int errors
    IntType {},
    IntParsing {},
    IntParsingSize {},
    IntFromFloat {},
    // ---------------------
    // float errors
    FloatType {},
    FloatParsing {},
    // ---------------------
    // bytes errors
    BytesType {},
    BytesTooShort {
        min_length: {ctx_type: usize, ctx_fn: field_from_context},
    },
    BytesTooLong {
        max_length: {ctx_type: usize, ctx_fn: field_from_context},
    },
    BytesInvalidEncoding {
… trimmed for the evaluation dataset …
            Self::FrozenField { .. } => "Field is frozen",
            Self::FrozenInstance { .. } => "Instance is frozen",
            Self::ExtraForbidden { .. } => "Extra inputs are not permitted",
            Self::InvalidKey { .. } => "Keys should be strings",
            Self::GetAttributeError { .. } => "Error extracting attribute: {error}",
            Self::ModelType { .. } => "Input should be a valid dictionary or instance of {class_name}",
            Self::ModelAttributesType { .. } => "Input should be a valid dictionary or object to extract fields from",
            Self::DataclassType { .. } => "Input should be a dictionary or an instance of {class_name}",
            Self::DataclassExactType { .. } => "Input should be an instance of {class_name}",
            Self::NamedTupleType { .. } => "Input should be a tuple, list, dictionary or an instance of {class_name}",
            Self::DefaultFactoryNotCalled { .. } => {
                "The default factory uses validated data, but at least one validation error occurred"
            }
            Self::NoneRequired { .. } => "Input should be None",
            Self::GreaterThan { .. } => "Input should be greater than {gt}",
            Self::GreaterThanEqual { .. } => "Input should be greater than or equal to {ge}",
            Self::LessThan { .. } => "Input should be less than {lt}",
            Self::LessThanEqual { .. } => "Input should be less than or equal to {le}",
            Self::MultipleOf { .. } => "Input should be a multiple of {multiple_of}",
            Self::FiniteNumber { .. } => "Input should be a finite number",
            Self::TooShort { .. } => {
                "{field_type} should have at least {min_length} item{expected_plural} after validation, not {actual_length}"
            }
            Self::TooLong { .. } => {
                "{field_type} should have at most {max_length} item{expected_plural} after validation, not {actual_length}"
            }
            Self::IterableType { .. } => "Input should be iterable",
            Self::IterationError { .. } => "Error iterating over object, error: {error}",
            Self::StringType { .. } => "Input should be a valid string",
            Self::StringUnicode { .. } => {
                "Input should be a valid string, unable to parse raw data as a unicode string"
            }
            Self::StringTooShort { .. } => "String should have at least {min_length} character{expected_plural}",
            Self::StringTooLong { .. } => "String should have at most {max_length} character{expected_plural}",
            Self::StringPatternMismatch { .. } => "String should match pattern '{pattern}'",
            Self::StringNotAscii { .. } => "String should contain only ASCII characters",
            Self::Enum { .. } => "Input should be {expected}",
            Self::DictType { .. } => "Input should be a valid dictionary",
            Self::FrozenDictType { .. } => "Input should be a valid frozendict",
            Self::OrderedDictType { .. } => "Input should be a valid OrderedDict",
            Self::CounterType { .. } => "Input should be a valid Counter",
            Self::MappingType { .. } => "Input should be a valid mapping, error: {error}",
            Self::ListType { .. } => "Input should be a valid list",
            Self::DequeType { .. } => "Input should be a valid deque",
            Self::TupleType { .. } => "Input should be a valid tuple",
            Self::SetType { .. } => "Input should be a valid set",
            Self::SetItemNotHashable { .. } => "Set items should be hashable",
            Self::BoolType { .. } => "Input should be a valid boolean",
            Self::BoolParsing { .. } => "Input should be a valid boolean, unable to interpret input",
            Self::IntType { .. } => "Input should be a valid integer",
            Self::IntParsing { .. } => "Input should be a valid integer, unable to parse string as an integer",
            Self::IntFromFloat { .. } => "Input should be a valid integer, got a number with a fractional part",
            Self::IntParsingSize { .. } => "Unable to parse input string as an integer, exceeded maximum size",
            Self::FloatType { .. } => "Input should be a valid number",
            Self::FloatParsing { .. } => "Input should be a valid number, unable to parse string as a number",
            Self::BytesType { .. } => "Input should be a valid bytes",
            Self::BytesTooShort { .. } => "Data should have at least {min_length} byte{expected_plural}",
            Self::BytesTooLong { .. } => "Data should have at most {max_length} byte{expected_plural}",
            Self::BytesInvalidEncoding { .. } => "Data should be valid {encoding}: {encoding_error}",
            Self::ValueError { .. } => "Value error, {error}",
            Self::AssertionError { .. } => "Assertion failed, {error}",
            Self::CustomError { .. } => "", // custom errors are handled separately
            Self::LiteralError { .. } => "Input should be {expected}",
            Self::MissingSentinelError { .. } => "Input should be the 'MISSING' sentinel",
            Self::EllipsisError { .. } => "Input should be the 'Ellipsis' literal",
            Self::DateType { .. } => "Input should be a valid date",
            Self::DateParsing { .. } => "Input should be a valid date in the format YYYY-MM-DD, {error}",
            Self::DateFromDatetimeParsing { .. } => "Input should be a valid date or datetime, {error}",
            Self::DateFromDatetimeInexact { .. } => {
                "Datetimes provided to dates should have zero time - e.g. be exact dates"
            }
            Self::DatePast { .. } => "Date should be in the past",
            Self::DateFuture { .. } => "Date should be in the future",
            Self::TimeType { .. } => "Input should be a valid time",
            Self::TimeParsing { .. } => "Input should be in a valid time format, {error}",
            Self::DatetimeType { .. } => "Input should be a valid datetime",
            Self::DatetimeParsing { .. } => "Input should be a valid datetime, {error}",
            Self::DatetimeObjectInvalid { .. } => "Invalid datetime object, got {error}",
            Self::DatetimeFromDateParsing { .. } => "Input should be a valid datetime or date, {error}",
            Self::DatetimePast { .. } => "Input should be in the past",
            Self::DatetimeFuture { .. } => "Input should be in the future",
… trimmed for the evaluation dataset …
            Self::UrlScheme { .. } => "URL scheme should be {expected_schemes}",
            Self::UuidType { .. } => "UUID input should be a string, bytes or UUID object",
            Self::UuidParsing { .. } => "Input should be a valid UUID, {error}",
            Self::UuidVersion { .. } => "UUID version {expected_version} expected",
            Self::DecimalType { .. } => "Decimal input should be an integer, float, string or Decimal object",
            Self::DecimalParsing { .. } => "Input should be a valid decimal",
            Self::DecimalMaxDigits { .. } => {
                "Decimal input should have no more than {max_digits} digit{expected_plural} in total"
            }
            Self::DecimalMaxPlaces { .. } => {
                "Decimal input should have no more than {decimal_places} decimal place{expected_plural}"
            }
            Self::DecimalWholeDigits { .. } => {
                "Decimal input should have no more than {whole_digits} digit{expected_plural} before the decimal point"
            }
            Self::FractionParsing { .. } => "Input is not a valid fraction",
            Self::FractionType { .. } => "Fraction input should be an integer, float, string or Fraction object",
            Self::ComplexType { .. } => {
                "Input should be a valid python complex object, a number, or a valid complex string following the rules at https://docs.python.org/3/library/functions.html#complex"
            }
            Self::ComplexStrParsing { .. } => {
                "Input should be a valid complex string following the rules at https://docs.python.org/3/library/functions.html#complex"
            }
        }
    }

    pub fn message_template_json(&self) -> &'static str {
        match self {
            Self::NoneRequired { .. } => "Input should be null",
            Self::ListType { .. }
            | Self::DequeType { .. }
            | Self::TupleType { .. }
            | Self::IterableType { .. }
            | Self::SetType { .. }
            | Self::FrozenSetType { .. } => "Input should be a valid array",
            Self::ModelType { .. }
            | Self::ModelAttributesType { .. }
            | Self::DictType { .. }
            | Self::FrozenDictType { .. }
            | Self::OrderedDictType { .. }
            | Self::CounterType { .. }
            | Self::DataclassType { .. } => "Input should be an object",
            Self::NamedTupleType { .. } => "Input should be an array or an object",
            Self::TimeDeltaType { .. } => "Input should be a valid duration",
            Self::TimeDeltaParsing { .. } => "Input should be a valid duration, {error}",
            Self::ArgumentsType { .. } => "Arguments must be an array or an object",
            _ => self.message_template_python(),
        }
    }

    pub fn valid_type(py: Python, error_type: &str) -> bool {
        let lookup = ERROR_TYPE_LOOKUP.get_or_init(py, Self::build_lookup);
        lookup.contains_key(error_type)
    }

    fn build_lookup() -> AHashMap<String, Self> {
        let mut lookup = AHashMap::new();
        for error_type in Self::iter() {
            if !matches!(error_type, Self::CustomError { .. }) {
                lookup.insert(error_type.to_string(), error_type);
            }
        }
        lookup
    }

    pub fn type_string(&self) -> String {
        match self {
            Self::CustomError { error_type, .. } => error_type.clone(),
            _ => self.to_string(),
        }
    }

    pub fn render_message(&self, py: Python, input_type: InputType) -> PyResult<String> {
        let tmpl = match input_type {
            InputType::Python => self.message_template_python(),
            _ => self.message_template_json(),
        };
        match self {
            Self::NoSuchAttribute { attribute, .. } => render!(tmpl, attribute),
            Self::JsonInvalid { error, .. }
            | Self::GetAttributeError { error, .. }
