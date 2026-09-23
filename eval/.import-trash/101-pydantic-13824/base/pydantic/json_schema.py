            The generated JSON schema.
        """
        items_schema = {} if 'items_schema' not in schema else self.generate_inner(schema['items_schema'])
        json_schema = {'type': 'array', 'items': items_schema}
        self.update_with_validations(json_schema, schema, self.ValidationsMapping.array)
        return json_schema

    def dict_schema(self, schema: core_schema.DictSchema) -> JsonSchemaValue:
        """Generates a JSON schema that matches a dict schema.

        Args:
            schema: The core schema.

        Returns:
            The generated JSON schema.
        """
        return self._common_dict_schema(schema)

    def frozendict_schema(self, schema: core_schema.FrozenDictSchema) -> JsonSchemaValue:
        """Generates a JSON schema that matches a frozendict schema.

        Args:
            schema: The core schema.

        Returns:
            The generated JSON schema.
        """
        return self._common_dict_schema(schema)

    def ordered_dict_schema(self, schema: core_schema.OrderedDictSchema) -> JsonSchemaValue:
        """Generates a JSON schema that matches an `OrderedDict` schema.

        Args:
            schema: The core schema.

        Returns:
            The generated JSON schema.
        """
        return self._common_dict_schema(schema)

    def _common_dict_schema(
        self, schema: core_schema.DictSchema | core_schema.FrozenDictSchema | core_schema.OrderedDictSchema
    ) -> JsonSchemaValue:
        json_schema: JsonSchemaValue = {'type': 'object'}

        keys_schema = self.generate_inner(schema['keys_schema']).copy() if 'keys_schema' in schema else {}
        if '$ref' not in keys_schema:
            keys_pattern = keys_schema.pop('pattern', None)
            # Don't give a title to patternProperties/propertyNames:
            keys_schema.pop('title', None)
        else:
            # Here, we assume that if the keys schema is a definition reference,
            # it can't be a simple string core schema (and thus no pattern can exist).
            # However, this is only in practice (in theory, a definition reference core
            # schema could be generated for a simple string schema).
            # Note that we avoid calling `self.resolve_ref_schema`, as it might not exist yet.
            keys_pattern = None

        values_schema = self.generate_inner(schema['values_schema']).copy() if 'values_schema' in schema else {}
        # don't give a title to additionalProperties:
        values_schema.pop('title', None)

        if values_schema or keys_pattern is not None:
            if keys_pattern is None:
                json_schema['additionalProperties'] = values_schema
            else:
                json_schema['patternProperties'] = {keys_pattern: values_schema}
        else:  # for `dict[str, Any]`, we allow any key and any value, since `str` is the default key type
            json_schema['additionalProperties'] = True

        if (
            # The len check indicates that constraints are probably present:
            (keys_schema.get('type') == 'string' and len(keys_schema) > 1)
            # If this is a definition reference schema, it most likely has constraints:
            or '$ref' in keys_schema
        ):
            keys_schema.pop('type', None)
            json_schema['propertyNames'] = keys_schema

        self.update_with_validations(json_schema, schema, self.ValidationsMapping.object)
        return json_schema

