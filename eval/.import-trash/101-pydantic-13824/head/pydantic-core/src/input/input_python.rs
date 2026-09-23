use std::str::from_utf8;

use pyo3::intern;
use pyo3::prelude::*;

use pyo3::types::PyType;
use pyo3::types::{
    PyBool, PyByteArray, PyBytes, PyComplex, PyDate, PyDateTime, PyDict, PyFloat, PyFrozenSet, PyInt, PyIterator,
    PyList, PyMapping, PySet, PyString, PyTime, PyTuple,
};

use pyo3::PyTypeCheck;
use pyo3::PyTypeInfo;
use speedate::MicrosecondsPrecisionOverflowBehavior;

use crate::ArgsKwargs;
use crate::common::counter::get_counter_type;
use crate::common::deque::{deque_maxlen, get_deque_type};
use crate::common::frozendict::get_frozendict_type;
use crate::common::ordered_dict::get_ordered_dict_type;
use crate::errors::{ErrorType, ErrorTypeDefaults, InputValue, LocItem, ValError, ValResult};
use crate::lookup_key::LookupPath;
use crate::tools::safe_repr;
use crate::validators::Exactness;
use crate::validators::TemporalUnitMode;
use crate::validators::ValBytesMode;
use crate::validators::complex::{get_complex_type, string_to_complex};
use crate::validators::decimal::{create_decimal, get_decimal_type};
use crate::validators::fraction::{create_fraction, get_fraction_type};

use super::Arguments;
use super::ConsumeIterator;
use super::KeywordArgs;
use super::PositionalArgs;
use super::ValidatedDict;
use super::ValidatedList;
use super::ValidatedSet;
use super::ValidatedTuple;
use super::datetime::{
    EitherDate, EitherDateTime, EitherTime, bytes_as_date, bytes_as_datetime, bytes_as_time, bytes_as_timedelta,
    date_as_datetime, float_as_datetime, float_as_duration, float_as_time, int_as_datetime, int_as_duration,
    int_as_time,
};
use super::input_abstract::ValMatch;
use super::return_enums::EitherComplex;
use super::return_enums::{ValidationMatch, iterate_attributes, iterate_mapping_items};
use super::shared::{
    decimal_as_int, float_as_int, fraction_as_int, get_enum_meta_object, int_as_bool, str_as_bool, str_as_float,
    str_as_int,
};
use super::{
    BorrowInput, EitherBytes, EitherFloat, EitherInt, EitherString, EitherTimedelta, GenericIterator, Input,
    py_string_str,
};

pub(crate) fn downcast_python_input<'py, T: PyTypeCheck>(input: &(impl Input<'py> + ?Sized)) -> Option<&Bound<'py, T>> {
    input.as_python().and_then(|any| any.cast::<T>().ok())
… trimmed for the evaluation dataset …
            && self.is_instance(frozendict_type)?
        {
            Ok(ValidationMatch::exact(GenericPyMapping::Mapping(
                self.cast::<PyMapping>()?,
            )))
        } else if let Ok(dict) = self.cast_exact::<PyDict>() {
            Ok(ValidationMatch::lax(GenericPyMapping::Dict(dict)))
        } else if let Ok(mapping) = self.cast::<PyMapping>() {
            Ok(ValidationMatch::lax(GenericPyMapping::Mapping(mapping)))
        } else {
            Err(ValError::new(ErrorTypeDefaults::FrozenDictType, self))
        }
    }

    fn strict_ordered_dict<'a>(&'a self) -> ValMatch<GenericPyMapping<'a, 'py>> {
        if self.is_instance(get_ordered_dict_type(self.py())?)? {
            // An `OrderedDict` is a `dict` subclass, but it is iterated over using the mapping protocol
            // as the `dict` C API does not account for reorderings (e.g. `move_to_end()`):
            Ok(ValidationMatch::exact(GenericPyMapping::Mapping(
                self.cast::<PyMapping>()?,
            )))
        } else {
            Err(ValError::new(ErrorTypeDefaults::OrderedDictType, self))
        }
    }

    fn lax_ordered_dict<'a>(&'a self) -> ValMatch<GenericPyMapping<'a, 'py>> {
        if self.is_instance(get_ordered_dict_type(self.py())?)? {
            Ok(ValidationMatch::exact(GenericPyMapping::Mapping(
                self.cast::<PyMapping>()?,
            )))
        } else if let Ok(dict) = self.cast_exact::<PyDict>() {
            Ok(ValidationMatch::lax(GenericPyMapping::Dict(dict)))
        } else if let Ok(mapping) = self.cast::<PyMapping>() {
            Ok(ValidationMatch::lax(GenericPyMapping::Mapping(mapping)))
        } else {
            Err(ValError::new(ErrorTypeDefaults::OrderedDictType, self))
        }
    }

    fn strict_counter<'a>(&'a self) -> ValMatch<GenericPyMapping<'a, 'py>> {
        if self.is_instance(get_counter_type(self.py())?)? {
            // A `Counter` is a `dict` subclass and (unlike `OrderedDict`) can safely be
            // iterated over using the `dict` C API:
            Ok(ValidationMatch::exact(GenericPyMapping::Dict(self.cast::<PyDict>()?)))
        } else {
            Err(ValError::new(ErrorTypeDefaults::CounterType, self))
        }
    }

    fn lax_counter<'a>(&'a self) -> ValMatch<GenericPyMapping<'a, 'py>> {
        if self.is_instance(get_counter_type(self.py())?)? {
            Ok(ValidationMatch::exact(GenericPyMapping::Dict(self.cast::<PyDict>()?)))
        } else if let Ok(dict) = self.cast_exact::<PyDict>() {
            Ok(ValidationMatch::lax(GenericPyMapping::Dict(dict)))
        } else if let Ok(mapping) = self.cast::<PyMapping>() {
            Ok(ValidationMatch::lax(GenericPyMapping::Mapping(mapping)))
        } else {
            Err(ValError::new(ErrorTypeDefaults::CounterType, self))
        }
    }

    fn validate_model_fields<'a>(
        &'a self,
        strict: bool,
        from_attributes: bool,
    ) -> ValResult<GenericPyMapping<'a, 'py>> {
        if from_attributes {
            // if from_attributes, first try a dict, then mapping then from_attributes
            if let Ok(dict) = self.cast::<PyDict>() {
                return Ok(GenericPyMapping::Dict(dict));
            } else if !strict && let Ok(mapping) = self.cast::<PyMapping>() {
                return Ok(GenericPyMapping::Mapping(mapping));
            }

            if from_attributes_applicable(self) {
                Ok(GenericPyMapping::GetAttr(self.to_owned(), None))
            } else if let Ok((obj, kwargs)) = self.extract() {
                if from_attributes_applicable(&obj) {
                    Ok(GenericPyMapping::GetAttr(obj, Some(kwargs)))
                } else {
                    Err(ValError::new(ErrorTypeDefaults::ModelAttributesType, self))
                }
            } else {
                // note the error here gives a hint about from_attributes
                Err(ValError::new(ErrorTypeDefaults::ModelAttributesType, self))
            }
        } else {
            // otherwise we just call back to validate_dict if from_mapping is allowed, note that errors in this
            // case (correctly) won't hint about from_attributes
            self.validate_dict(strict)
        }
    }

    type List<'a>
        = PySequenceIterable<'a, 'py>
    where
        Self: 'a;

    fn validate_list<'a>(&'a self, strict: bool) -> ValMatch<PySequenceIterable<'a, 'py>> {
        if let Ok(list) = self.cast::<PyList>() {
            return Ok(ValidationMatch::exact(PySequenceIterable::List(list)));
