import dataclasses
import ipaddress
import json
import platform
import re
import sys
from collections import Counter, OrderedDict, deque, namedtuple
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from enum import Enum
from math import inf, isinf, isnan, nan
from pathlib import Path
from typing import ClassVar

import pytest
from dirty_equals import HasRepr, IsList

import pydantic_core
from pydantic_core import (
    PydanticSerializationError,
    SchemaSerializer,
    SchemaValidator,
    core_schema,
    to_json,
    to_jsonable_python,
)

from ..conftest import plain_repr
from .test_dataclasses import IsStrictDict, on_pypy
from .test_list_tuple import as_list, as_tuple

try:
    import numpy
except ImportError:
    numpy = None


@pytest.fixture(scope='module')
def any_serializer():
    return SchemaSerializer(core_schema.any_schema())


def test_repr(any_serializer):
    assert plain_repr(any_serializer) == 'SchemaSerializer(serializer=Any(AnySerializer),definitions=[])'


@dataclasses.dataclass(frozen=True)
… trimmed for the evaluation dataset …

    assert any_serializer.to_python(MyEnum.a, mode='json') == 1
    assert any_serializer.to_python(MyEnum.b, mode='json') == 'b'
    assert any_serializer.to_python({MyEnum.a: 42}, mode='json') == {'1': 42}
    assert any_serializer.to_python({MyEnum.b: 42}, mode='json') == {'b': 42}

    assert any_serializer.to_json(MyEnum.a) == b'1'
    assert any_serializer.to_json(MyEnum.b) == b'"b"'
    assert any_serializer.to_json({MyEnum.a: 42}) == b'{"1":42}'
    assert any_serializer.to_json({MyEnum.b: 42}) == b'{"b":42}'


def test_base64():
    s = SchemaSerializer(core_schema.any_schema(), core_schema.CoreConfig(ser_json_bytes='base64'))
    assert s.to_python(b'foo') == b'foo'
    assert s.to_python(b'foo', mode='json') == 'Zm9v'
    assert s.to_json(b'foo') == b'"Zm9v"'
    assert s.to_python(bytearray(b'foo')) == b'foo'
    assert s.to_python(bytearray(b'foo'), mode='json') == 'Zm9v'
    assert s.to_json(bytearray(b'foo')) == b'"Zm9v"'


@pytest.mark.parametrize(
    'gen_input,kwargs,expected_json',
    [
        # (lambda: UUID('ebcdab58-6eb8-46fb-a190-d07a33e9eac8'), '"ebcdab58-6eb8-46fb-a190-d07a33e9eac8"'),
        (lambda: datetime(2032, 1, 1, 1, 1), {}, b'"2032-01-01T01:01:00"'),
        (lambda: datetime(2032, 1, 1, 1, 1, tzinfo=timezone.utc), {}, b'"2032-01-01T01:01:00Z"'),
        (lambda: datetime(2032, 1, 1, 1, 1, tzinfo=timezone(timedelta(hours=2))), {}, b'"2032-01-01T01:01:00+02:00"'),
        (lambda: datetime(2032, 1, 1), {}, b'"2032-01-01T00:00:00"'),
        (lambda: time(12, 34, 56), {}, b'"12:34:56"'),
        (lambda: timedelta(days=12, seconds=34, microseconds=56), {}, b'"P12DT34.000056S"'),
        (lambda: timedelta(days=12, seconds=34, microseconds=56), dict(timedelta_mode='float'), b'1036834.000056'),
        (lambda: timedelta(seconds=-1), {}, b'"-PT1S"'),
        (lambda: timedelta(seconds=-1), dict(timedelta_mode='float'), b'-1.0'),
        (lambda: {1, 2, 3}, {}, b'[1,2,3]'),
        (lambda: frozenset([1, 2, 3]), {}, b'[1,2,3]'),
        (lambda: deque([1, 2, 3]), {}, b'[1,2,3]'),
        (lambda: deque([1, 2, 3], maxlen=5), {}, b'[1,2,3]'),
        (lambda: OrderedDict([('a', 1), ('b', 2)]), {}, b'{"a":1,"b":2}'),
        (lambda: Counter({'a': 1, 'b': 2}), {}, b'{"a":1,"b":2}'),
        (lambda: (v for v in range(4)), {}, b'[0,1,2,3]'),
        (lambda: iter([0, 1, 2, 3]), {}, b'[0,1,2,3]'),
        (lambda: iter((0, 1, 2, 3)), {}, b'[0,1,2,3]'),
        (lambda: iter(range(4)), {}, b'[0,1,2,3]'),
        (lambda: b'this is bytes', {}, b'"this is bytes"'),
        (lambda: b'this is bytes', dict(bytes_mode='base64'), b'"dGhpcyBpcyBieXRlcw=="'),
        (lambda: bytearray(b'this is bytes'), {}, b'"this is bytes"'),
        (lambda: bytearray(b'this is bytes'), dict(bytes_mode='base64'), b'"dGhpcyBpcyBieXRlcw=="'),
        (lambda: Decimal('12.34'), {}, b'"12.34"'),
        (lambda: MyEnum.a, {}, b'1'),
        (lambda: MyEnum.b, {}, b'"b"'),
        (lambda: [MyDataclass(1, 'a', 2), MyModel(a=2, b='b')], {}, b'[{"a":1,"b":"a"},{"a":2,"b":"b"}]'),
        (lambda: re.compile('^regex$'), {}, b'"^regex$"'),
    ],
)
def test_encoding(any_serializer, gen_input, kwargs, expected_json):
    assert to_json(gen_input(), **kwargs) == expected_json
    if not kwargs:
        assert any_serializer.to_python(gen_input(), mode='json') == json.loads(expected_json)


def test_any_dataclass():
    @dataclasses.dataclass
    class Foo:
        a: str
        b: bytes

    # Build a schema that does not include the field 'b', to test that it is not serialized
    schema = core_schema.dataclass_schema(
        Foo,
        core_schema.dataclass_args_schema(
            'Foo', [core_schema.dataclass_field(name='a', schema=core_schema.str_schema())]
        ),
        ['a'],
    )
    Foo.__pydantic_serializer__ = SchemaSerializer(schema)

    s = SchemaSerializer(core_schema.any_schema())
    assert s.to_python(Foo(a='hello', b=b'more')) == IsStrictDict(a='hello')
    assert s.to_python(Foo(a='hello', b=b'more'), mode='json') == IsStrictDict(a='hello')
… trimmed for the evaluation dataset …

    output = any_serializer.to_python(MyDeque([1, 2]))

    assert output == deque([1, 2])
    assert type(output) is deque
    assert any_serializer.to_json(MyDeque([1, 2])) == b'[1,2]'


def test_ordered_dict(any_serializer) -> None:
    d = OrderedDict([('a', 1), ('b', 2), ('c', 3)])
    # the `dict` C API doesn't account for reorderings, make sure we don't use it:
    d.move_to_end('a')
    output = any_serializer.to_python(d)

    assert output == d
    assert list(output) == ['b', 'c', 'a']
    assert type(output) is OrderedDict
    assert output is not d
    assert any_serializer.to_python(d, mode='json') == {'b': 2, 'c': 3, 'a': 1}
    assert any_serializer.to_json(d) == b'{"b":2,"c":3,"a":1}'
    assert to_jsonable_python(d) == {'b': 2, 'c': 3, 'a': 1}

    # key-based include/exclude, like dicts:
    assert any_serializer.to_python(d, include={'a', 'b'}) == OrderedDict([('b', 2), ('a', 1)])
    assert any_serializer.to_python(d, exclude={'a'}, mode='json') == {'b': 2, 'c': 3}
    assert any_serializer.to_json(d, exclude={'b'}) == b'{"c":3,"a":1}'

    # nested values are inferred as well:
    assert any_serializer.to_json(OrderedDict(m=MyModel(a=1, b='b'))) == b'{"m":{"a":1,"b":"b"}}'


def test_ordered_dict_subclass(any_serializer) -> None:
    class MyOrderedDict(OrderedDict):
        pass

    output = any_serializer.to_python(MyOrderedDict([('a', 1)]))

    assert output == OrderedDict([('a', 1)])
    assert type(output) is OrderedDict
    assert any_serializer.to_json(MyOrderedDict([('a', 1)])) == b'{"a":1}'


def test_counter(any_serializer) -> None:
    c = Counter({'a': 3, 'b': 0, 'c': -2})
    output = any_serializer.to_python(c)

    assert output == c
    assert dict(output) == {'a': 3, 'b': 0, 'c': -2}
    assert type(output) is Counter
    assert output is not c
    assert any_serializer.to_python(c, mode='json') == {'a': 3, 'b': 0, 'c': -2}
    assert any_serializer.to_json(c) == b'{"a":3,"b":0,"c":-2}'
    assert to_jsonable_python(c) == {'a': 3, 'b': 0, 'c': -2}

    # key-based include/exclude, like dicts:
    assert any_serializer.to_python(c, include={'a', 'b'}) == Counter({'a': 3, 'b': 0})
    assert any_serializer.to_python(c, exclude={'a'}, mode='json') == {'b': 0, 'c': -2}
    assert any_serializer.to_json(c, exclude={'b'}) == b'{"a":3,"c":-2}'

    # nested values are inferred as well:
    assert any_serializer.to_json(Counter(m=MyModel(a=1, b='b'))) == b'{"m":{"a":1,"b":"b"}}'


def test_counter_subclass(any_serializer) -> None:
    class MyCounter(Counter):
        pass

    output = any_serializer.to_python(MyCounter({'a': 1}))

    assert output == Counter({'a': 1})
    assert type(output) is Counter
    assert any_serializer.to_json(MyCounter({'a': 1})) == b'{"a":1}'
