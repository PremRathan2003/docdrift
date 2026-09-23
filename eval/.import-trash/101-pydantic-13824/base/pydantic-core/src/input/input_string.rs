    fn validate_decimal(&self, _strict: bool, _py: Python<'py>) -> ValMatch<Bound<'py, PyAny>> {
        match self {
            Self::String(s) => create_decimal(s, self).map(ValidationMatch::strict),
            Self::Mapping(_) => Err(ValError::new(ErrorTypeDefaults::DecimalType, self)),
        }
    }

    fn validate_fraction(&self, _strict: bool, _py: Python<'py>) -> ValMatch<Bound<'py, PyAny>> {
        match self {
            Self::String(s) => create_fraction(s, self).map(ValidationMatch::strict),
            Self::Mapping(_) => Err(ValError::new(ErrorTypeDefaults::FractionType, self)),
        }
    }

    type Dict<'a>
        = StringMappingDict<'py>
    where
        Self: 'a;

    fn strict_dict(&self) -> ValResult<StringMappingDict<'py>> {
        match self {
            Self::String(_) => Err(ValError::new(ErrorTypeDefaults::DictType, self)),
            Self::Mapping(d) => Ok(StringMappingDict(d.clone())),
        }
    }

    fn strict_frozendict(&self) -> ValMatch<StringMappingDict<'py>> {
        match self {
            Self::String(_) => Err(ValError::new(ErrorTypeDefaults::FrozenDictType, self)),
            Self::Mapping(d) => Ok(ValidationMatch::strict(StringMappingDict(d.clone()))),
        }
    }

    fn strict_ordered_dict(&self) -> ValMatch<StringMappingDict<'py>> {
        match self {
            Self::String(_) => Err(ValError::new(ErrorTypeDefaults::OrderedDictType, self)),
            Self::Mapping(d) => Ok(ValidationMatch::strict(StringMappingDict(d.clone()))),
        }
    }

    type List<'a>
        = Never
    where
        Self: 'a;

    fn validate_list(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::ListType, self))
    }

    fn validate_deque(&self, _strict: bool) -> ValMatch<(Never, Option<usize>)> {
        Err(ValError::new(ErrorTypeDefaults::DequeType, self))
    }

    type Tuple<'a>
        = Never
    where
        Self: 'a;

    fn validate_tuple(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::TupleType, self))
    }

    type Set<'a>
        = Never
    where
        Self: 'a;

    fn validate_set(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::SetType, self))
    }

    fn validate_frozenset(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::FrozenSetType, self))
    }

    fn validate_iter(&self) -> ValResult<GenericIterator<'static>> {
        Err(ValError::new(ErrorTypeDefaults::IterableType, self))
    }

    fn validate_date(&self, _strict: bool, mode: TemporalUnitMode) -> ValResult<ValidationMatch<EitherDate<'py>>> {
