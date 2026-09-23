use std::borrow::Cow;
use std::cell::RefCell;

use pyo3::exceptions::PyTypeError;
use pyo3::intern;
use pyo3::prelude::*;
use pyo3::sync::PyOnceLock;
use pyo3::sync::critical_section::with_critical_section;
use pyo3::types::PyComplex;
use pyo3::types::{PyByteArray, PyBytes, PyDict, PyFrozenSet, PyIterator, PyList, PyMapping, PySet, PyString, PyTuple};

use pyo3::IntoPyObjectExt;
use serde::ser::{Error, Serialize, SerializeSeq, Serializer};

use crate::common::counter::get_counter_type;
use crate::common::deque::{deque_maxlen, new_deque};
use crate::common::frozendict::get_frozendict_type;
use crate::common::ordered_dict::get_ordered_dict_type;
use crate::input::{EitherTimedelta, Int};
use crate::serializers::SerializationState;
use crate::serializers::errors::unwrap_ser_error;
use crate::serializers::extra::IncludeExclude;
use crate::serializers::shared::DoSerialize;
use crate::serializers::shared::SerializeMap;
use crate::serializers::shared::serialize_to_json;
use crate::serializers::shared::serialize_to_python;
use crate::serializers::type_serializers;
use crate::serializers::type_serializers::any::AnySerializer;
use crate::serializers::type_serializers::format::serialize_via_str;
use crate::tools::{py_err, safe_repr};

use super::SchemaSerializer;
use super::config::InfNanMode;
use super::errors::SERIALIZATION_ERR_MARKER;
use super::errors::{PydanticSerializationError, py_err_se_err};
use super::extra::SerMode;
use super::filter::{AnyFilter, SchemaFilter};
use super::ob_type::ObType;

pub(crate) fn infer_to_python<'py>(
    value: &Bound<'py, PyAny>,
    state: &mut SerializationState<'py>,
) -> PyResult<Py<PyAny>> {
    infer_to_python_known(state.extra.ob_type_lookup.get_type(value), value, state)
}

// arbitrary ids to identify that we recursed through infer_to_{python,json}_known
// We just need them to be different from definition ref slot ids, which start at 0
const INFER_DEF_REF_ID: usize = usize::MAX;

pub(crate) fn infer_to_python_known<'py>(
    ob_type: ObType,
    value: &Bound<'py, PyAny>,
    state: &mut SerializationState<'py>,
) -> PyResult<Py<PyAny>> {
… trimmed for the evaluation dataset …
                v.into_py_any(py)?
            }
            ObType::Decimal | ObType::Fraction => value.to_string().into_py_any(py)?,
            ObType::StrSubclass => PyString::new(py, value.cast::<PyString>()?.to_str()?).into(),
            ObType::Bytes => state
                .config
                .bytes_mode
                .bytes_to_string(py, value.cast::<PyBytes>()?.as_bytes())?
                .into_py_any(py)?,
            ObType::Bytearray => {
                let py_byte_array = value.cast::<PyByteArray>()?;
                with_critical_section(py_byte_array, || {
                    // SAFETY: `py_byte_array` is protected by a critical section,
                    // which guarantees no mutation, and `bytes_to_string` does not
                    // run any code which could cause the critical section to be
                    // released.
                    let bytes = unsafe { py_byte_array.as_bytes() };
                    state.config.bytes_mode.bytes_to_string(py, bytes)?.into_py_any(py)
                })?
            }
            ObType::Tuple => {
                let elements = serialize_seq_filter!(PyTuple);
                PyList::new(py, elements)?.into()
            }
            ObType::List => {
                let elements = serialize_seq_filter!(PyList);
                PyList::new(py, elements)?.into()
            }
            ObType::Set => {
                let elements = serialize_seq!(PySet);
                PyList::new(py, elements)?.into()
            }
            ObType::Frozenset => {
                let elements = serialize_seq!(PyFrozenSet);
                PyList::new(py, elements)?.into()
            }
            ObType::Deque => {
                let elements = serialize_seq_filter!(@iter value.len()?, value.try_iter()?);
                PyList::new(py, elements)?.into()
            }
            ObType::Dict | ObType::Counter => {
                let dict = value.cast::<PyDict>()?;
                serialize_pairs(dict.iter().map(Ok), state, serialize_to_python(py))?
            }
            ObType::Frozendict | ObType::OrderedDict => {
                let mapping = value.cast::<PyMapping>()?;
                serialize_pairs(mapping_pairs(mapping)?, state, serialize_to_python(py))?
            }
            ObType::Datetime => {
                let datetime = state.config.temporal_mode.datetime_to_json(value.py(), value.cast()?)?;
                datetime.into_py_any(py)?
            }
            ObType::Date => {
                let date = state.config.temporal_mode.date_to_json(value.py(), value.cast()?)?;
                date.into_py_any(py)?
            }
            ObType::Time => {
                let time = state.config.temporal_mode.time_to_json(value.py(), value.cast()?)?;
                time.into_py_any(py)?
            }
            ObType::Timedelta => {
                let either_delta = EitherTimedelta::try_from(value)?;
                state.config.temporal_mode.timedelta_to_json(value.py(), either_delta)?
            }
            ObType::Url
            | ObType::MultiHostUrl
            | ObType::Path
            | ObType::Ipv4Address
            | ObType::Ipv6Address
            | ObType::Ipv4Network
            | ObType::Ipv6Network => serialize_via_str(value, serialize_to_python(py))?,
            ObType::Uuid => {
                let uuid = super::type_serializers::uuid::uuid_to_string(value)?;
                uuid.into_py_any(py)?
            }
            ObType::PydanticSerializable => serialize_pydantic_serializable(value, state, serialize_to_python(py))?,
            ObType::Dataclass => infer_serialize_dataclass(value, state, serialize_to_python(py))?,
            ObType::Enum => {
                let v = value.getattr(intern!(py, "value"))?;
                infer_to_python(&v, state)?
            }
… trimmed for the evaluation dataset …
                } else {
                    return Err(unknown_type_error(value));
                }
            }
        },
        _ => match ob_type {
            ObType::Tuple => {
                let elements = serialize_seq_filter!(PyTuple);
                PyTuple::new(py, elements)?.into()
            }
            ObType::List => {
                let elements = serialize_seq_filter!(PyList);
                PyList::new(py, elements)?.into()
            }
            ObType::Set => {
                let elements = serialize_seq!(PySet);
                PySet::new(py, &elements)?.into()
            }
            ObType::Frozenset => {
                let elements = serialize_seq!(PyFrozenSet);
                PyFrozenSet::new(py, &elements)?.into()
            }
            ObType::Deque => {
                let elements = serialize_seq_filter!(@iter value.len()?, value.try_iter()?);
                new_deque(py, PyList::new(py, elements)?, deque_maxlen(value)?)?
            }
            ObType::Dict => {
                let dict = value.cast::<PyDict>()?;
                serialize_pairs(dict.iter().map(Ok), state, serialize_to_python(py))?
            }
            ObType::Frozendict => {
                let mapping = value.cast::<PyMapping>()?;
                let new_dict = serialize_pairs(mapping_pairs(mapping)?, state, serialize_to_python(py))?;
                get_frozendict_type(py)?.call1((new_dict,))?.unbind()
            }
            ObType::OrderedDict => {
                let mapping = value.cast::<PyMapping>()?;
                let new_dict = serialize_pairs(mapping_pairs(mapping)?, state, serialize_to_python(py))?;
                get_ordered_dict_type(py)?.call1((new_dict,))?.unbind()
            }
            ObType::Counter => {
                let dict = value.cast::<PyDict>()?;
                let new_dict = serialize_pairs(dict.iter().map(Ok), state, serialize_to_python(py))?;
                get_counter_type(py)?.call1((new_dict,))?.unbind()
            }
            ObType::PydanticSerializable => serialize_pydantic_serializable(value, state, serialize_to_python(py))?,
            ObType::Dataclass => infer_serialize_dataclass(value, state, serialize_to_python(py))?,
            ObType::Generator => {
                let iter = super::type_serializers::generator::SerializationIterator::new(
                    value.cast()?,
                    super::type_serializers::any::AnySerializer::get(),
                    SchemaFilter::default(),
                    state,
                );
                iter.into_py_any(py)?
            }
            ObType::Complex => {
                let v = value.cast::<PyComplex>()?;
                v.into_py_any(py)?
            }
            ObType::Fraction => value.to_string().into_py_any(py)?,
            ObType::Unknown => {
                if let Some(fallback) = &state.extra.fallback {
                    let next_value = fallback.call1((value,))?;
                    let next_result = infer_to_python(&next_value, state);
                    return next_result;
                }
                value.clone().unbind()
            }
            _ => value.clone().unbind(),
        },
    };
    Ok(value)
}

pub(crate) struct SerializeInfer<'slf, 'py> {
    value: &'slf Bound<'py, PyAny>,
    state: RefCell<&'slf mut SerializationState<'py>>,
}

impl<'slf, 'py> SerializeInfer<'slf, 'py> {
    pub(crate) fn new(value: &'slf Bound<'py, PyAny>, state: &'slf mut SerializationState<'py>) -> Self {
        Self {
            value,
            state: RefCell::new(state),
… trimmed for the evaluation dataset …
            }
            seq.end()
        }};
    }

    match ob_type {
        ObType::None => serializer.serialize_none(),
        ObType::Int | ObType::IntSubclass => serialize!(Int),
        ObType::Bool => serialize!(bool),
        ObType::Complex => {
            let v = value.cast::<PyComplex>().map_err(py_err_se_err)?;
            let complex_str = type_serializers::complex::complex_to_str(v);
            Ok(serializer.collect_str::<String>(&complex_str)?)
        }
        ObType::Float | ObType::FloatSubclass => {
            let v = value.extract::<f64>().map_err(py_err_se_err)?;
            type_serializers::float::serialize_f64(v, serializer, state.config.inf_nan_mode)
        }
        ObType::Decimal | ObType::Fraction => value.to_string().serialize(serializer),
        ObType::Str | ObType::StrSubclass => {
            let py_str = value.cast::<PyString>().map_err(py_err_se_err)?;
            serialize_to_json(serializer)
                .serialize_str(py_str)
                .map_err(unwrap_ser_error)
        }
        ObType::Bytes => {
            let py_bytes = value.cast::<PyBytes>().map_err(py_err_se_err)?;
            state.config.bytes_mode.serialize_bytes(py_bytes.as_bytes(), serializer)
        }
        ObType::Bytearray => {
            let py_byte_array = value.cast::<PyByteArray>().map_err(py_err_se_err)?;
            with_critical_section(py_byte_array, || {
                // SAFETY: `py_byte_array` is protected by a critical section,
                // which guarantees no mutation, and `serialize_bytes` does not
                // run any code which could cause the critical section to be
                // released.
                let bytes = unsafe { py_byte_array.as_bytes() };
                state.config.bytes_mode.serialize_bytes(bytes, serializer)
            })
        }
        ObType::Dict | ObType::Counter => {
            let dict = value.cast::<PyDict>().map_err(py_err_se_err)?;
            serialize_pairs(dict.iter().map(Ok), state, serialize_to_json(serializer)).map_err(unwrap_ser_error)
        }
        ObType::Frozendict | ObType::OrderedDict => {
            let mapping = value.cast::<PyMapping>().map_err(py_err_se_err)?;
            let pairs = mapping_pairs(mapping).map_err(py_err_se_err)?;
            serialize_pairs(pairs, state, serialize_to_json(serializer)).map_err(unwrap_ser_error)
        }
        ObType::List => serialize_seq_filter!(PyList),
        ObType::Tuple => serialize_seq_filter!(PyTuple),
        ObType::Set => serialize_seq!(PySet),
        ObType::Frozenset => serialize_seq!(PyFrozenSet),
        ObType::Deque => serialize_seq_filter!(
            @iter value.len().map_err(py_err_se_err)?,
            value.try_iter().map_err(py_err_se_err)?
        ),
        ObType::Datetime => {
            let py_datetime = value.cast().map_err(py_err_se_err)?;
            state.config.temporal_mode.datetime_serialize(py_datetime, serializer)
        }
        ObType::Date => {
            let py_date = value.cast().map_err(py_err_se_err)?;
            state.config.temporal_mode.date_serialize(py_date, serializer)
        }
        ObType::Time => {
            let py_time = value.cast().map_err(py_err_se_err)?;
            state.config.temporal_mode.time_serialize(py_time, serializer)
        }
        ObType::Timedelta => {
            let either_delta = EitherTimedelta::try_from(value).map_err(py_err_se_err)?;
            state.config.temporal_mode.timedelta_serialize(either_delta, serializer)
        }
        ObType::Url
        | ObType::MultiHostUrl
        | ObType::Path
        | ObType::Ipv4Address
        | ObType::Ipv6Address
        | ObType::Ipv4Network
        | ObType::Ipv6Network => serialize_via_str(value, serialize_to_json(serializer)).map_err(unwrap_ser_error),
        ObType::PydanticSerializable => {
… trimmed for the evaluation dataset …
                let bytes = unsafe { py_byte_array.as_bytes() };
                state.config.bytes_mode.bytes_to_string(key.py(), bytes)
            })
            .map(|cow| Cow::Owned(cow.into_owned()))
        }
        ObType::Datetime => state.config.temporal_mode.datetime_json_key(key.cast()?),
        ObType::Date => state.config.temporal_mode.date_json_key(key.cast()?),
        ObType::Time => state.config.temporal_mode.time_json_key(key.cast()?),
        ObType::Uuid => {
            let uuid = super::type_serializers::uuid::uuid_to_string(key)?;
            Ok(Cow::Owned(uuid))
        }
        ObType::Timedelta => {
            let either_delta = EitherTimedelta::try_from(key)?;
            state.config.temporal_mode.timedelta_json_key(&either_delta)
        }
        ObType::Url
        | ObType::MultiHostUrl
        | ObType::Path
        | ObType::Ipv4Address
        | ObType::Ipv6Address
        | ObType::Ipv4Network
        | ObType::Ipv6Network => {
            // FIXME it would be nice to have a "PyCow" which carries ownership of the Python type too
            Ok(Cow::Owned(key.str()?.to_string_lossy().into_owned()))
        }
        ObType::Tuple => {
            let mut key_build = super::type_serializers::tuple::KeyBuilder::new();
            for element in key.cast::<PyTuple>()?.iter_borrowed() {
                key_build.push(&infer_json_key(&element, state)?);
            }
            Ok(Cow::Owned(key_build.finish()))
        }
        ObType::List
        | ObType::Set
        | ObType::Frozenset
        | ObType::Deque
        | ObType::Dict
        | ObType::Frozendict
        | ObType::OrderedDict
        | ObType::Counter
        | ObType::Generator => {
            py_err!(PyTypeError; "`{ob_type}` not valid as object key")
        }
        ObType::Dataclass | ObType::PydanticSerializable => {
            // check that the instance is hashable
            key.hash()?;
            let key = key.str()?.to_string();
            Ok(Cow::Owned(key))
        }
        ObType::Enum => {
            let k = key.getattr(intern!(key.py(), "value"))?;
            infer_json_key(&k, state).map(|cow| Cow::Owned(cow.into_owned()))
        }
        ObType::Complex => {
            let v = key.cast::<PyComplex>()?;
            Ok(type_serializers::complex::complex_to_str(v).into())
        }
        ObType::Pattern => Ok(Cow::Owned(
            key.getattr(intern!(key.py(), "pattern"))?
                .str()?
                .to_string_lossy()
                .into_owned(),
        )),
        ObType::Unknown => {
            if let Some(fallback) = &state.extra.fallback {
                let next_key = fallback.call1((key,))?;
                infer_json_key(&next_key, state).map(|cow| Cow::Owned(cow.into_owned()))
            } else if state.extra.serialize_unknown {
                Ok(serialize_unknown(key))
            } else {
                Err(unknown_type_error(key))
            }
        }
    }
}

pub(crate) fn get_pydantic_serializer<'py>(value: &Bound<'py, PyAny>) -> PyResult<Bound<'py, SchemaSerializer>> {
    let py = value.py();
    let py_serializer = value.getattr(intern!(py, "__pydantic_serializer__"))?;
    py_serializer.cast_into_exact().map_err(Into::into)
