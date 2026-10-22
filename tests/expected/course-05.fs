: quot >r s>d r> sm/rem nip ;

0 value a
5 value b
2 value c
0 value d
0 value e

0 value my_func.f
: my_func
  5 to my_func.f
  begin e my_func.f <> while
    ." The value of e is:" cr
    e 0 .r
    e 1+ to e
  repeat
  e ;

: main
  ." Hello world!" cr
  b to a
  b c * 10 quot to d
  d 0 .r
  my_func drop
  e b = if ." Variable 'e' equals 'b'" cr then ;

main
