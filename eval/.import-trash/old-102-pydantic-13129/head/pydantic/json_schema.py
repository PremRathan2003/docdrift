        Returns:
            The generated JSON schema.
        """
        return self.generate_inner(schema['return_schema'])

    def model_schema(self, schema: core_schema.ModelSchema) -> JsonSchemaValue:
        """Generates a JSON schema that matches a schema that defines a model.

        Args:
            schema: The core schema.

        Returns:
            The generated JSON schema.
        """
        # We do not use schema['model'].model_json_schema() here
        # because it could lead to inconsistent refs handling, etc.
        cls = cast('type[BaseModel]', schema['cls'])
        config = cls.model_config

        with self._config_wrapper_stack.push(config):
            json_schema = self.generate_inner(schema['schema'])

        self._update_class_schema(json_schema, cls, config)

        return json_schema

    def _update_class_schema(self, json_schema: JsonSchemaValue, cls: type[Any], config: ConfigDict) -> None:
        """Update json_schema with the following, extracted from `config` and `cls`:

        * title
        * description
        * additional properties
        * json_schema_extra
        * deprecated

        Done in place, hence there's no return value as the original json_schema is mutated.
        No ref resolving is involved here, as that's not appropriate for simple updates.
        """
        from ._internal._dataclasses import is_stdlib_dataclass
        from .main import BaseModel

        if (config_title := config.get('title')) is not None:
            json_schema.setdefault('title', config_title)
        elif model_title_generator := config.get('model_title_generator'):
            title = model_title_generator(cls)
            if not isinstance(title, str):
                raise TypeError(f'model_title_generator {model_title_generator} must return str, not {title.__class__}')
            json_schema.setdefault('title', title)
        if 'title' not in json_schema:
            json_schema['title'] = cls.__name__

        # BaseModel and dataclasses; don't use cls.__doc__ as it will contain the verbose class signature by default
        if cls is BaseModel:
            docstring = None
        elif is_stdlib_dataclass(cls):  # For Pydantic dataclasses, we already handle this at class creation
            # The `dataclass` module generates a `__doc__` based on the `inspect.signature()`
            # result, which we don't want to use as a description. Such `__doc__` startswith
            # `cls.__name__(`, which could lead to mistakenly discarding it if for some reason
            # an explicitly set class docstring follows the same pattern, but this is unlikely
            # to happen.
            doc = cls.__doc__
            docstring = None if doc is None or doc.startswith(f'{cls.__name__}(') else doc
        else:
            docstring = cls.__doc__

        if docstring:
            json_schema.setdefault('description', inspect.cleandoc(docstring))

        extra = config.get('extra')
        if 'additionalProperties' not in json_schema:  # This check is particularly important for `typed_dict_schema()`
            if extra == 'allow':
                json_schema['additionalProperties'] = True
            elif extra == 'forbid':
                json_schema['additionalProperties'] = False

        json_schema_extra = config.get('json_schema_extra')
        if issubclass(cls, BaseModel) and cls.__pydantic_root_model__:
            root_json_schema_extra = cls.model_fields['root'].json_schema_extra
            if json_schema_extra and root_json_schema_extra:
                raise ValueError(
                    '"model_config[\'json_schema_extra\']" and "Field.json_schema_extra" on "RootModel.root"'
                    ' field must not be set simultaneously'
                )
            if root_json_schema_extra:
                json_schema_extra = root_json_schema_extra

        if isinstance(json_schema_extra, (staticmethod, classmethod)):
            # In older versions of python, this is necessary to ensure staticmethod/classmethods are callable
            json_schema_extra = json_schema_extra.__get__(cls)

        if isinstance(json_schema_extra, dict):
            json_schema.update(json_schema_extra)
        elif callable(json_schema_extra):
            if len(_typing_extra.signature_no_eval(json_schema_extra).parameters) > 1:
                json_schema_extra = cast(Callable[[JsonDict, type[Any]], None], json_schema_extra)
                json_schema_extra(json_schema, cls)
            else:
                json_schema_extra = cast(Callable[[JsonDict], None], json_schema_extra)
                json_schema_extra(json_schema)
        elif json_schema_extra is not None:
            raise ValueError(
                f"model_config['json_schema_extra']={json_schema_extra} should be a dict, callable, or None"
            )

        if hasattr(cls, '__deprecated__'):
            json_schema['deprecated'] = True

