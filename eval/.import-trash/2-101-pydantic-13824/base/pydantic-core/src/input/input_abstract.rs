
    type Dict<'a>: ValidatedDict<'py>
    where
        Self: 'a;

    fn validate_dict(&self, strict: bool) -> ValResult<Self::Dict<'_>> {
        if strict { self.strict_dict() } else { self.lax_dict() }
    }
    fn strict_dict(&self) -> ValResult<Self::Dict<'_>>;
    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn lax_dict(&self) -> ValResult<Self::Dict<'_>> {
        self.strict_dict()
    }

    fn validate_frozendict(&self, strict: bool) -> ValMatch<Self::Dict<'_>> {
        if strict {
            self.strict_frozendict()
        } else {
            self.lax_frozendict()
        }
    }
    fn strict_frozendict(&self) -> ValMatch<Self::Dict<'_>>;
    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn lax_frozendict(&self) -> ValMatch<Self::Dict<'_>> {
        self.strict_frozendict()
    }

    fn validate_ordered_dict(&self, strict: bool) -> ValMatch<Self::Dict<'_>> {
        if strict {
            self.strict_ordered_dict()
        } else {
            self.lax_ordered_dict()
        }
    }
    fn strict_ordered_dict(&self) -> ValMatch<Self::Dict<'_>>;
    #[cfg_attr(has_coverage_attribute, coverage(off))]
    fn lax_ordered_dict(&self) -> ValMatch<Self::Dict<'_>> {
        self.strict_ordered_dict()
    }

    fn validate_model_fields(&self, strict: bool, _from_attributes: bool) -> ValResult<Self::Dict<'_>> {
        self.validate_dict(strict)
    }

    type List<'a>: ValidatedList<'py>
    where
        Self: 'a;

    fn validate_list(&self, strict: bool) -> ValMatch<Self::List<'_>>;

    fn validate_deque(&self, strict: bool) -> ValMatch<(Self::List<'_>, Option<usize>)>;

    type Tuple<'a>: ValidatedTuple<'py>
    where
        Self: 'a;

    fn validate_tuple(&self, strict: bool) -> ValMatch<Self::Tuple<'_>>;

    type Set<'a>: ValidatedSet<'py>
    where
        Self: 'a;

    fn validate_set(&self, strict: bool) -> ValMatch<Self::Set<'_>>;

    fn validate_frozenset(&self, strict: bool) -> ValMatch<Self::Set<'_>>;

    fn validate_iter(&self) -> ValResult<GenericIterator<'static>>;

    fn validate_date(&self, strict: bool, mode: TemporalUnitMode) -> ValMatch<EitherDate<'py>>;

    fn validate_time(
        &self,
        strict: bool,
        microseconds_overflow_behavior: speedate::MicrosecondsPrecisionOverflowBehavior,
    ) -> ValMatch<EitherTime<'py>>;

    fn validate_datetime(
        &self,
        strict: bool,
        microseconds_overflow_behavior: speedate::MicrosecondsPrecisionOverflowBehavior,
