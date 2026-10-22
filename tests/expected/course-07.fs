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

0 value main.g
0 value main.i
: main
  0 to main.g
  0 to main.i
  ." Hello world!" cr
  b to a
  b c * 10 quot to d
  d 0 .r
  my_func drop
  e b = if ." Variable 'e' equals 'b'" cr then
  5 3 5 * + 2 quot 5 + -1 * to main.g
  main.g 0 .r
  e main.g < if
    ." Variable 'e' is less than 'g'" cr
  else
    ." Variable 'e' is greater than or equal to 'g'" cr
  then
  ." Counting up with i:" cr
  0 to main.i
  begin main.i 15 > 0= while
    main.i 0 .r
    main.i 1+ to main.i
  repeat ;

main
