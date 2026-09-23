    # The handler lambdas take the `GenerateSchema` instance as their first argument, so that
    # the dicts can be built once at class creation time and shared by all instances:
    _handlers: ClassVar[dict[Any, Callable[[GenerateSchema, Any], core_schema.CoreSchema]]] = {
        str: lambda self, obj: core_schema.str_schema(),
        bytes: lambda self, obj: core_schema.bytes_schema(),
        int: lambda self, obj: core_schema.int_schema(),
        float: lambda self, obj: core_schema.float_schema(),
        bool: lambda self, obj: core_schema.bool_schema(),
        complex: lambda self, obj: core_schema.complex_schema(),
        object: lambda self, obj: core_schema.any_schema(),
        datetime.date: lambda self, obj: core_schema.date_schema(),
        datetime.datetime: lambda self, obj: core_schema.datetime_schema(),
        datetime.time: lambda self, obj: core_schema.time_schema(),
        datetime.timedelta: lambda self, obj: core_schema.timedelta_schema(),
        Decimal: lambda self, obj: core_schema.decimal_schema(),
        UUID: lambda self, obj: core_schema.uuid_schema(),
        Url: lambda self, obj: core_schema.url_schema(),
        Fraction: lambda self, obj: core_schema.fraction_schema(),
        MultiHostUrl: lambda self, obj: core_schema.multi_host_url_schema(),
        None: lambda self, obj: core_schema.none_schema(),
        NoneType: lambda self, obj: core_schema.none_schema(),
        MISSING: lambda self, obj: core_schema.missing_sentinel_schema(),
        EllipsisType: lambda self, obj: core_schema.ellipsis_schema(),
        type: lambda self, obj: self._type_schema(),
        dict: lambda self, obj: self._dict_schema(Any, Any),
        tuple: lambda self, obj: self._tuple_schema(obj),
        list: lambda self, obj: self._list_schema(Any),
        set: lambda self, obj: self._set_schema(Any),
        collections.abc.MutableSet: lambda self, obj: self._set_schema(Any),
        frozenset: lambda self, obj: self._frozenset_schema(Any),
        collections.abc.Set: lambda self, obj: self._frozenset_schema(Any),
        collections.abc.MutableSequence: lambda self, obj: self._list_schema(Any),
        collections.abc.Sequence: lambda self, obj: self._sequence_schema(Any),
        collections.deque: lambda self, obj: self._deque_schema(Any),
        collections.abc.Iterable: lambda self, obj: self._iterable_schema(obj),
        collections.abc.Generator: lambda self, obj: self._iterable_schema(obj),
        collections.abc.Mapping: lambda self, obj: self._mapping_schema(obj, Any, Any),
        collections.abc.MutableMapping: lambda self, obj: self._mapping_schema(obj, Any, Any),
        collections.OrderedDict: lambda self, obj: self._ordered_dict_schema(Any, Any),
        collections.defaultdict: lambda self, obj: self._mapping_schema(obj, Any, Any),
        collections.Counter: lambda self, obj: self._mapping_schema(obj, Any, int),
        collections.abc.Callable: lambda self, obj: core_schema.callable_schema(),
        collections.abc.Hashable: lambda self, obj: self._hashable_schema(),
        IPv4Address: lambda self, obj: self._ip_schema(obj),
        IPv4Interface: lambda self, obj: self._ip_schema(obj),
        IPv4Network: lambda self, obj: self._ip_schema(obj),
        IPv6Address: lambda self, obj: self._ip_schema(obj),
        IPv6Interface: lambda self, obj: self._ip_schema(obj),
        IPv6Network: lambda self, obj: self._ip_schema(obj),
        os.PathLike: lambda self, obj: self._path_schema(obj, Any),
        pathlib.Path: lambda self, obj: self._path_schema(obj, Any),
        pathlib.PurePath: lambda self, obj: self._path_schema(obj, Any),
        pathlib.PosixPath: lambda self, obj: self._path_schema(obj, Any),
        pathlib.WindowsPath: lambda self, obj: self._path_schema(obj, Any),
        pathlib.PurePosixPath: lambda self, obj: self._path_schema(obj, Any),
        pathlib.PureWindowsPath: lambda self, obj: self._path_schema(obj, Any),
        re.Pattern: lambda self, obj: self._pattern_schema(obj),
        ZoneInfo: lambda self, obj: self._zoneinfo_schema(),
    }

    _generic_handlers: ClassVar[dict[Any, Callable[[GenerateSchema, Any], core_schema.CoreSchema]]] = {
        tuple: lambda self, obj: self._tuple_schema(obj),
        list: lambda self, obj: self._list_schema(self._get_first_arg_or_any(obj)),
        dict: lambda self, obj: self._dict_schema(*self._get_first_two_args_or_any(obj)),
        set: lambda self, obj: self._set_schema(self._get_first_arg_or_any(obj)),
        frozenset: lambda self, obj: self._frozenset_schema(self._get_first_arg_or_any(obj)),
        type: lambda self, obj: self._subclass_schema(obj),
        collections.abc.MutableSequence: lambda self, obj: self._list_schema(self._get_first_arg_or_any(obj)),
        collections.abc.MutableSet: lambda self, obj: self._set_schema(self._get_first_arg_or_any(obj)),
        collections.abc.Set: lambda self, obj: self._frozenset_schema(self._get_first_arg_or_any(obj)),
        collections.deque: lambda self, obj: self._deque_schema(self._get_first_arg_or_any(obj)),
        collections.abc.Mapping: lambda self, obj: self._mapping_schema(
            collections.abc.Mapping, *self._get_first_two_args_or_any(obj)
        ),
        collections.abc.MutableMapping: lambda self, obj: self._mapping_schema(
            collections.abc.MutableMapping, *self._get_first_two_args_or_any(obj)
        ),
        collections.OrderedDict: lambda self, obj: self._ordered_dict_schema(*self._get_first_two_args_or_any(obj)),
        collections.defaultdict: lambda self, obj: self._mapping_schema(
            collections.defaultdict, *self._get_first_two_args_or_any(obj)
        ),
        collections.Counter: lambda self, obj: self._mapping_schema(
            collections.Counter, self._get_first_arg_or_any(obj), int
        ),
        os.PathLike: lambda self, obj: self._path_schema(os.PathLike, self._get_first_arg_or_any(obj)),
        pathlib.Path: lambda self, obj: self._path_schema(pathlib.Path, self._get_first_arg_or_any(obj)),
        pathlib.PurePath: lambda self, obj: self._path_schema(pathlib.PurePath, self._get_first_arg_or_any(obj)),
        pathlib.PosixPath: lambda self, obj: self._path_schema(pathlib.PosixPath, self._get_first_arg_or_any(obj)),
        pathlib.WindowsPath: lambda self, obj: self._path_schema(pathlib.WindowsPath, self._get_first_arg_or_any(obj)),
        pathlib.PurePosixPath: lambda self, obj: self._path_schema(
            pathlib.PurePosixPath, self._get_first_arg_or_any(obj)
        ),
        pathlib.PureWindowsPath: lambda self, obj: self._path_schema(
            pathlib.PureWindowsPath, self._get_first_arg_or_any(obj)
        ),
        collections.abc.Sequence: lambda self, obj: self._sequence_schema(self._get_first_arg_or_any(obj)),
        collections.abc.Iterable: lambda self, obj: self._iterable_schema(obj),
        collections.abc.Generator: lambda self, obj: self._iterable_schema(obj),
        re.Pattern: lambda self, obj: self._pattern_schema(obj),
        collections.abc.Callable: lambda self, obj: core_schema.callable_schema(),
    }

    if sys.version_info >= (3, 15):
        _handlers[frozendict] = lambda self, obj: self._frozendict_schema(Any, Any)
        _generic_handlers[frozendict] = lambda self, obj: self._frozendict_schema(*self._get_first_two_args_or_any(obj))

    def __init_subclass__(cls) -> None:
        super().__init_subclass__()
        warnings.warn(
            'Subclassing `GenerateSchema` is not supported. The API is highly subject to change in minor versions.',
            UserWarning,
            stacklevel=2,
        )

    @property
    def _config_wrapper(self) -> ConfigWrapper:
        return self._config_wrapper_stack.tail

    @property
    def _types_namespace(self) -> NamespacesTuple:
        return self._ns_resolver.types_namespace

    @property
    def _arbitrary_types(self) -> bool:
        return self._config_wrapper.arbitrary_types_allowed

    # the following methods can be overridden but should be considered
    # unstable / private APIs
    def _list_schema(self, items_type: Any) -> CoreSchema:
        return core_schema.list_schema(self.generate_schema(items_type))

    def _dict_schema(self, keys_type: Any, values_type: Any) -> CoreSchema:
        return core_schema.dict_schema(self.generate_schema(keys_type), self.generate_schema(values_type))

    def _frozendict_schema(self, keys_type: Any, values_type: Any) -> CoreSchema:
        return core_schema.frozendict_schema(self.generate_schema(keys_type), self.generate_schema(values_type))

    def _ordered_dict_schema(self, keys_type: Any, values_type: Any) -> CoreSchema:
        return core_schema.ordered_dict_schema(self.generate_schema(keys_type), self.generate_schema(values_type))

    def _set_schema(self, items_type: Any) -> CoreSchema:
        return core_schema.set_schema(self.generate_schema(items_type))

    def _frozenset_schema(self, items_type: Any) -> CoreSchema:
        return core_schema.frozenset_schema(self.generate_schema(items_type))

    def _enum_schema(self, enum_type: type[Enum]) -> CoreSchema:
        cases: list[Any] = list(enum_type.__members__.values())

        enum_ref = _type_refs.enum_type_ref(enum_type)
        description = None if not enum_type.__doc__ else inspect.cleandoc(enum_type.__doc__)
        if (
            description == 'An enumeration.'
        ):  # This is the default value provided by enum.EnumMeta.__new__; don't use it
            description = None
        js_updates = {'title': enum_type.__name__, 'description': description}
        js_updates = {k: v for k, v in js_updates.items() if v is not None}

        sub_type: Literal['str', 'int', 'float'] | None = None
        if issubclass(enum_type, int):
            sub_type = 'int'
            value_ser_type: core_schema.SerSchema = core_schema.simple_ser_schema('int')
        elif issubclass(enum_type, str):
            # this handles `StrEnum` (3.11 only), and also `Foobar(str, Enum)`
            sub_type = 'str'
            value_ser_type = core_schema.simple_ser_schema('str')
        elif issubclass(enum_type, float):
            sub_type = 'float'
            value_ser_type = core_schema.simple_ser_schema('float')
        else:
            # TODO this is an ugly hack, how do we trigger an Any schema for serialization?
            value_ser_type = core_schema.plain_serializer_function_ser_schema(lambda x: x)

        if cases:

            def get_json_schema(schema: CoreSchema, handler: GetJsonSchemaHandler) -> JsonSchemaValue:
                json_schema = handler(schema)
                original_schema = handler.resolve_ref_schema(json_schema)
                original_schema.update(js_updates)
                return json_schema
