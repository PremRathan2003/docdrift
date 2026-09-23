                create_fraction(&PyString::new(py, &f.to_string()), self).map(ValidationMatch::strict)
            }
            JsonValue::Str(..) | JsonValue::Int(..) | JsonValue::BigInt(..) => {
                create_fraction(&self.into_pyobject(py)?, self).map(ValidationMatch::strict)
            }
            _ => Err(ValError::new(ErrorTypeDefaults::FractionType, self)),
        }
    }

    type Dict<'a>
        = &'a JsonObject<'data>
    where
        Self: 'a;

    fn validate_dict(&self, _strict: bool) -> ValResult<Self::Dict<'_>> {
        match self {
            JsonValue::Object(dict) => Ok(dict),
            _ => Err(ValError::new(ErrorTypeDefaults::DictType, self)),
        }
    }
    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn strict_dict(&self) -> ValResult<Self::Dict<'_>> {
        self.validate_dict(false)
    }

    fn strict_frozendict(&self) -> ValMatch<Self::Dict<'_>> {
        match self {
            JsonValue::Object(dict) => Ok(ValidationMatch::strict(dict)),
            _ => Err(ValError::new(ErrorTypeDefaults::FrozenDictType, self)),
        }
    }

    fn strict_ordered_dict(&self) -> ValMatch<Self::Dict<'_>> {
        // we allow an object here since otherwise it would be impossible to create an OrderedDict from JSON
        match self {
            JsonValue::Object(dict) => Ok(ValidationMatch::strict(dict)),
            _ => Err(ValError::new(ErrorTypeDefaults::OrderedDictType, self)),
        }
    }

    fn strict_counter(&self) -> ValMatch<Self::Dict<'_>> {
        // we allow an object here since otherwise it would be impossible to create a Counter from JSON
        match self {
            JsonValue::Object(dict) => Ok(ValidationMatch::strict(dict)),
            _ => Err(ValError::new(ErrorTypeDefaults::CounterType, self)),
        }
    }

    type List<'a>
        = &'a JsonArray<'data>
    where
        Self: 'a;

    fn validate_list(&self, _strict: bool) -> ValMatch<&JsonArray<'data>> {
        match self {
            JsonValue::Array(a) => Ok(ValidationMatch::exact(a)),
            _ => Err(ValError::new(ErrorTypeDefaults::ListType, self)),
        }
    }

    fn validate_deque(&self, _strict: bool) -> ValMatch<(&JsonArray<'data>, Option<usize>)> {
        // we allow a list here since otherwise it would be impossible to create a deque from JSON
        match self {
            JsonValue::Array(a) => Ok(ValidationMatch::strict((a, None))),
            _ => Err(ValError::new(ErrorTypeDefaults::DequeType, self)),
        }
    }

    type Tuple<'a>
        = &'a JsonArray<'data>
    where
        Self: 'a;

    fn validate_tuple(&self, _strict: bool) -> ValMatch<&JsonArray<'data>> {
        // just as in set's case, List has to be allowed
        match self {
            JsonValue::Array(a) => Ok(ValidationMatch::strict(a)),
            _ => Err(ValError::new(ErrorTypeDefaults::TupleType, self)),
        }
    }

    type Set<'a>
        = &'a JsonArray<'data>
    where
        Self: 'a;

    fn validate_set(&self, _strict: bool) -> ValMatch<&JsonArray<'data>> {
        // we allow a list here since otherwise it would be impossible to create a set from JSON
… trimmed for the evaluation dataset …
        }
    }

    fn validate_bool(&self, _strict: bool) -> ValResult<ValidationMatch<bool>> {
        str_as_bool(self, self).map(ValidationMatch::lax)
    }

    fn validate_int(&self, _strict: bool) -> ValResult<ValidationMatch<EitherInt<'_>>> {
        str_as_int(self, self).map(ValidationMatch::lax)
    }

    fn validate_float(&self, _strict: bool) -> ValResult<ValidationMatch<EitherFloat<'_>>> {
        str_as_float(self, self).map(ValidationMatch::lax)
    }

    fn validate_decimal(&self, _strict: bool, py: Python<'py>) -> ValMatch<Bound<'py, PyAny>> {
        create_decimal(self.into_pyobject(py)?.as_any(), self).map(ValidationMatch::lax)
    }

    fn validate_fraction(&self, _strict: bool, py: Python<'py>) -> ValMatch<Bound<'py, PyAny>> {
        create_fraction(self.into_pyobject(py)?.as_any(), self).map(ValidationMatch::lax)
    }

    type Dict<'a> = Never;

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn strict_dict(&self) -> ValResult<Never> {
        Err(ValError::new(ErrorTypeDefaults::DictType, self))
    }

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn strict_frozendict(&self) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::FrozenDictType, self))
    }

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn strict_ordered_dict(&self) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::OrderedDictType, self))
    }

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn strict_counter(&self) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::CounterType, self))
    }

    type List<'a> = Never;

    fn validate_list(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::ListType, self))
    }

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn validate_deque(&self, _strict: bool) -> ValMatch<(Never, Option<usize>)> {
        Err(ValError::new(ErrorTypeDefaults::DequeType, self))
    }

    type Tuple<'a> = Never;

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn validate_tuple(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::TupleType, self))
    }

    type Set<'a> = Never;

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn validate_set(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::SetType, self))
    }

    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn validate_frozenset(&self, _strict: bool) -> ValMatch<Never> {
        Err(ValError::new(ErrorTypeDefaults::SetType, self))
    }

    fn validate_iter(&self) -> ValResult<GenericIterator<'static>> {
        Ok(string_to_vec(self).into())
    }

    fn validate_date(&self, _strict: bool, mode: TemporalUnitMode) -> ValResult<ValidationMatch<EitherDate<'py>>> {
        bytes_as_date(self, self.as_bytes(), mode).map(ValidationMatch::lax)
    }

    fn validate_time(
        &self,
