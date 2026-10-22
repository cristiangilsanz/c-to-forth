: quot >r s>d r> sm/rem nip ;
: rem >r s>d r> sm/rem drop ;

0 value main.i
0 value main.n
0 value main.steps
0 value main.found
0 value main.k
0 value main.break
0 value main.continue
0 value main.break2
: main
  0 to main.i
  0 to main.n
  0 to main.steps
  0 to main.found
  0 to main.k
  ." Odd numbers up to 12:"
  0 to main.i
  false to main.break
  begin main.break 0= while
    false to main.continue
    main.i 12 > if true to main.break then
    main.break 0= if
      main.i 2 rem 0 = if true to main.continue then
      main.continue 0= if ."  " main.i 0 .r then
    then
    main.break 0= if main.i 1+ to main.i then
  repeat
  cr
  27 to main.n
  0 to main.steps
  begin
    main.n 2 rem 0 <> if 3 main.n * 1 + else main.n 2 quot then to main.n
    main.steps 1+ to main.steps
    main.n 1 <> while
  repeat
  ." Collatz steps from 27: " main.steps 0 .r cr
  -1 to main.found
  1 to main.k
  false to main.break2
  begin main.break2 0= while
    main.k main.k * 500 > if
      main.k to main.found
      true to main.break2
    then
    main.break2 0= if main.k 1+ to main.k then
  repeat
  ." First square above 500: " main.found 0 .r ." ^2" cr ;

main
