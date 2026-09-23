        children.reserve(items.len());
        for (_, value) in items.iter() {
            children.push(value);
        }
        Ok(())
    } else {
        extend_from_iterable(children, &items.call_method0(intern!(schema.py(), "values"))?)
    }
}

/// `children.extend(s['schema'] for s in schema['arguments_schema'])`
fn children_arguments<'py>(children: &mut Children<'py>, schema: &Bound<'py, PyDict>) -> PyResult<()> {
    let py = schema.py();
    let mut parameters = Children::new();
    extend_from_iterable(&mut parameters, &required(schema, intern!(py, "arguments_schema"))?)?;
    for parameter in &parameters {
        child_required(children, parameter.cast::<PyDict>()?, intern!(py, "schema"))?;
    }
    Ok(())
}

/// Collect the child schemas of `schema` (of type `schema_type`, anything but `'definition-ref'`),
/// in traversal order (not including the `'serialization'` schema).
fn collect_child_schemas<'py>(
    children: &mut Children<'py>,
    schema: &Bound<'py, PyDict>,
    schema_type: &str,
) -> PyResult<()> {
    let py = schema.py();
    match schema_type {
        "definitions" => {
            child_required(children, schema, intern!(py, "schema"))?;
            children_required(children, schema, intern!(py, "definitions"))?;
        }
        "list" | "deque" | "set" | "frozenset" | "generator" => {
            child_optional(children, schema, intern!(py, "items_schema"))?;
        }
        "tuple" => {
            children_optional(children, schema, intern!(py, "items_schema"))?;
        }
        "dict" | "frozendict" | "ordered-dict" => {
            child_optional(children, schema, intern!(py, "keys_schema"))?;
            child_optional(children, schema, intern!(py, "values_schema"))?;
        }
        "union" => {
            let mut choices = Children::new();
            extend_from_iterable(&mut choices, &required(schema, intern!(py, "choices"))?)?;
            // `iter_union_choices()`: `choice[0] if isinstance(choice, tuple) else choice`
            for choice in choices {
                if choice.is_instance_of::<PyTuple>() {
                    children.push(choice.get_item(0)?);
                } else {
                    children.push(choice);
                }
            }
        }
        "tagged-union" => {
            children_values_required(children, schema, intern!(py, "choices"))?;
        }
        "chain" => {
            children_required(children, schema, intern!(py, "steps"))?;
        }
        "lax-or-strict" => {
            child_required(children, schema, intern!(py, "lax_schema"))?;
            child_required(children, schema, intern!(py, "strict_schema"))?;
        }
        "json-or-python" => {
            child_required(children, schema, intern!(py, "json_schema"))?;
            child_required(children, schema, intern!(py, "python_schema"))?;
        }
        "model-fields" | "typed-dict" => {
            child_optional(children, schema, intern!(py, "extras_schema"))?;
            children_optional(children, schema, intern!(py, "computed_fields"))?;
            children_values_required(children, schema, intern!(py, "fields"))?;
        }
        "dataclass-args" => {
            children_optional(children, schema, intern!(py, "computed_fields"))?;
            children_required(children, schema, intern!(py, "fields"))?;
        }
        "named-tuple" => {
            children_required(children, schema, intern!(py, "fields"))?;
