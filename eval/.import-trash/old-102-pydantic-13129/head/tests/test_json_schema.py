                'required': ['x'],
                'title': 'Model',
                'type': 'object',
            },
        ),
    ],
)
def test_hashable_types(metadata, json_schema):
    class Model(BaseModel):
        x: Annotated[int, metadata] | None

    assert Model.model_json_schema() == json_schema


def test_root_model():
    class A(RootModel[int]):
        """A Model docstring"""

    assert A.model_json_schema() == {'title': 'A', 'description': 'A Model docstring', 'type': 'integer'}

    class B(RootModel[A]):
        pass

    assert B.model_json_schema() == {
        '$defs': {'A': {'description': 'A Model docstring', 'title': 'A', 'type': 'integer'}},
        '$ref': '#/$defs/A',
        'title': 'B',
    }

    class C(RootModel[A]):
        """C Model docstring"""

    assert C.model_json_schema() == {
        '$defs': {'A': {'description': 'A Model docstring', 'title': 'A', 'type': 'integer'}},
        '$ref': '#/$defs/A',
        'title': 'C',
        'description': 'C Model docstring',
    }


def test_root_model_annotated_root_type_parameterized() -> None:
    """https://github.com/pydantic/pydantic/issues/13123"""

    MyType = Annotated[str, Field(examples=['hello'], description='desc', deprecated=True)]

    class MyModel(RootModel[MyType]):
        pass

    assert MyModel.model_json_schema() == {
        'deprecated': True,
        'description': 'desc',
        'examples': ['hello'],
        'title': 'MyModel',
        'type': 'string',
    }


def test_root_model_annotated_root_type() -> None:
    """https://github.com/pydantic/pydantic/issues/13123"""

    class MyModel(RootModel):
        root: Annotated[str, Field(examples=['hello'], description='desc', deprecated=True)]

    assert MyModel.model_json_schema() == {
        'deprecated': True,
        'description': 'desc',
        'examples': ['hello'],
        'title': 'MyModel',
        'type': 'string',
    }


def test_type_adapter_json_schemas_title_description():
    class Model(BaseModel):
        a: str

    _, json_schema = TypeAdapter.json_schemas([(Model, 'validation', TypeAdapter(Model))])
    assert 'title' not in json_schema
    assert 'description' not in json_schema

    _, json_schema = TypeAdapter.json_schemas(
        [(Model, 'validation', TypeAdapter(Model))],
        title='test title',
        description='test description',
    )
    assert json_schema['title'] == 'test title'
    assert json_schema['description'] == 'test description'


def test_type_adapter_json_schemas_without_definitions():
    _, json_schema = TypeAdapter.json_schemas(
        [(int, 'validation', TypeAdapter(int))],
        ref_template='#/components/schemas/{model}',
    )

    assert 'definitions' not in json_schema


def test_custom_chain_schema():
    class MySequence:
        @classmethod
        def __get_pydantic_core_schema__(cls, source_type: Any, handler: GetCoreSchemaHandler) -> CoreSchema:
            list_schema = core_schema.list_schema()
            return core_schema.chain_schema([list_schema])

    class Model(BaseModel):
        model_config = ConfigDict(arbitrary_types_allowed=True)

        a: MySequence

    assert Model.model_json_schema() == {
        'properties': {'a': {'items': {}, 'title': 'A', 'type': 'array'}},
