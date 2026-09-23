use std::fmt::Debug;
use std::str::FromStr;
use std::sync::Arc;

use enum_dispatch::enum_dispatch;
use jiter::{PartialMode, StringCacheMode};

use pyo3::exceptions::{PyTypeError, PyValueError};
use pyo3::pybacked::PyBackedStr;
use pyo3::types::{PyAny, PyDict, PyString, PyTuple, PyType};
use pyo3::{IntoPyObjectExt, prelude::*};
use pyo3::{PyTraverseError, PyVisit, intern};

use crate::build_tools::{ExtraBehavior, py_schema_error_type};
use crate::definitions::{Definitions, DefinitionsBuilder};
use crate::errors::{LocItem, ValError, ValResult, ValidationError};
use crate::input::{Input, InputType, StringMapping};
use crate::py_gc::PyGcTraverse;
use crate::recursion_guard::RecursionState;
use crate::tools::SchemaDict;
pub(crate) use config::{TemporalUnitMode, ValBytesMode};

mod any;
mod arguments;
mod arguments_v3;
mod bool;
mod bytes;
mod call;
mod callable;
mod chain;
pub(crate) mod complex;
mod config;
mod custom_error;
mod dataclass;
mod date;
mod datetime;
pub(crate) mod decimal;
mod definitions;
mod deque;
mod dict;
mod ellipsis;
mod enum_;
mod float;
pub(crate) mod fraction;
mod frozendict;
mod frozenset;
mod function;
mod generator;
mod int;
mod is_instance;
mod is_subclass;
mod json;
mod json_or_python;
mod lax_or_strict;
mod list;
mod literal;
mod missing_sentinel;
mod model;
mod model_fields;
mod named_tuple;
mod none;
mod nullable;
mod ordered_dict;
mod prebuilt;
mod set;
mod shared;
mod string;
mod time;
mod timedelta;
mod tuple;
mod typed_dict;
mod union;
… trimmed for the evaluation dataset …
        typed_dict::TypedDictValidator,
        // unions
        union::UnionValidator,
        union::TaggedUnionValidator,
        // nullables
        nullable::NullableValidator,
        // model classes
        model::ModelValidator,
        model_fields::ModelFieldsValidator,
        // dataclasses
        dataclass::DataclassArgsValidator,
        dataclass::DataclassValidator,
        // named tuples
        named_tuple::NamedTupleValidator,
        // strings
        string::StrValidator,
        // integers
        int::IntValidator,
        // boolean
        bool::BoolValidator,
        // floats
        float::FloatBuilder,
        // decimals
        decimal::DecimalValidator,
        // fractions
        fraction::FractionValidator,
        // tuples
        tuple::TupleValidator,
        // list/arrays
        list::ListValidator,
        // deques
        deque::DequeValidator,
        // sets - unique lists
        set::SetValidator,
        // dicts/objects (recursive)
        dict::DictValidator,
        // frozendicts
        frozendict::FrozenDictValidator,
        // ordered dicts
        ordered_dict::OrderedDictValidator,
        // None/null
        none::NoneValidator,
        // functions - before, after, plain & wrap
        function::FunctionAfterValidator,
        function::FunctionBeforeValidator,
        function::FunctionPlainValidator,
        function::FunctionWrapValidator,
        // function call - validation around a function call
        call::CallValidator,
        // literals
        literal::LiteralValidator,
        // missing sentinel
        missing_sentinel::MissingSentinelValidator,
        // ellipsis
        ellipsis::EllipsisValidator,
        // enums
        enum_::BuildEnumValidator,
        // any
        any::AnyValidator,
        // bytes
        bytes::BytesValidator,
        // dates
        date::DateValidator,
        // times
        time::TimeValidator,
        // datetimes
        datetime::DateTimeValidator,
        // frozensets
        frozenset::FrozenSetValidator,
        // timedelta
        timedelta::TimeDeltaValidator,
        // introspection types
        is_instance::IsInstanceValidator,
        is_subclass::IsSubclassValidator,
        callable::CallableValidator,
        // arguments
        arguments::ArgumentsValidator,
        arguments_v3::ArgumentsV3Validator,
        // default value
        with_default::WithDefaultValidator,
… trimmed for the evaluation dataset …
    TaggedUnion(Box<union::TaggedUnionValidator>),
    // nullables
    Nullable(nullable::NullableValidator),
    // create new model classes
    Model(model::ModelValidator),
    ModelFields(model_fields::ModelFieldsValidator),
    // dataclasses
    DataclassArgs(dataclass::DataclassArgsValidator),
    Dataclass(dataclass::DataclassValidator),
    // named tuples
    NamedTuple(named_tuple::NamedTupleValidator),
    // strings
    Str(string::StrValidator),
    StrConstrained(string::StrConstrainedValidator),
    // integers
    Int(int::IntValidator),
    ConstrainedInt(Box<int::ConstrainedIntValidator>),
    // booleans
    Bool(bool::BoolValidator),
    // floats
    Float(float::FloatValidator),
    ConstrainedFloat(float::ConstrainedFloatValidator),
    // decimals
    Decimal(decimal::DecimalValidator),
    // fractions
    Fraction(fraction::FractionValidator),
    // lists
    List(list::ListValidator),
    // deques
    Deque(deque::DequeValidator),
    // sets - unique lists
    Set(set::SetValidator),
    // tuples
    Tuple(tuple::TupleValidator),
    // dicts/objects (recursive)
    Dict(dict::DictValidator),
    // frozendicts
    FrozenDict(frozendict::FrozenDictValidator),
    // ordered dicts
    OrderedDict(ordered_dict::OrderedDictValidator),
    // None/null
    None(none::NoneValidator),
    // functions
    FunctionBefore(function::FunctionBeforeValidator),
    FunctionAfter(function::FunctionAfterValidator),
    FunctionPlain(function::FunctionPlainValidator),
    FunctionWrap(function::FunctionWrapValidator),
    // function call - validation around a function call
    FunctionCall(call::CallValidator),
    // literals
    Literal(literal::LiteralValidator),
    // Missing sentinel
    MissingSentinel(missing_sentinel::MissingSentinelValidator),
    // Ellipsis
    Ellipsis(ellipsis::EllipsisValidator),
    // enums
    IntEnum(enum_::EnumValidator<enum_::IntEnumValidator>),
    StrEnum(enum_::EnumValidator<enum_::StrEnumValidator>),
    FloatEnum(enum_::EnumValidator<enum_::FloatEnumValidator>),
    PlainEnum(enum_::EnumValidator<enum_::PlainEnumValidator>),
    // any
    Any(any::AnyValidator),
    // bytes
    Bytes(bytes::BytesValidator),
    ConstrainedBytes(bytes::BytesConstrainedValidator),
    // dates
    Date(date::DateValidator),
    // times
    Time(time::TimeValidator),
    // datetimes
    Datetime(datetime::DateTimeValidator),
    // frozensets
    FrozenSet(frozenset::FrozenSetValidator),
    // timedelta
    Timedelta(timedelta::TimeDeltaValidator),
    // introspection types
    IsInstance(is_instance::IsInstanceValidator),
    IsSubclass(is_subclass::IsSubclassValidator),
    Callable(callable::CallableValidator),
    // arguments
