: quot >r s>d r> sm/rem nip ;

0 value a
5 value b
2 value c
0 value d

0 value my_func.e
0 value my_func.f
: my_func
  0 to my_func.e
  5 to my_func.f
  begin my_func.e my_func.f <> while
    ." The value of e is:" cr
    my_func.e 0 .r
    my_func.e 1+ to my_func.e
  repeat ;

: main
  ." Hello world!" cr
  b to a
  b c * 10 quot to d
  d 0 .r
  my_func ;

main
