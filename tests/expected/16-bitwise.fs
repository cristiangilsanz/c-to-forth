0 value popcount.x
0 value popcount.count
: popcount
  to popcount.x
  0 to popcount.count
  begin popcount.x 0 <> while
    popcount.count popcount.x 1 and + to popcount.count
    popcount.x 1 1 lshift / to popcount.x
  repeat
  popcount.count ;

0 value main.a
0 value main.b
: main
  90 to main.a
  15 to main.b
  ." a & b = " main.a main.b and 0 .r ." , a | b = " main.a main.b or 0 .r ." , a ^ b = " main.a main.b xor 0 .r cr
  ." ~a = " main.a invert 0 .r ." , a << 3 = " main.a 3 lshift 0 .r ." , -20 >> 2 = " -20 1 2 lshift / 0 .r cr
  ." a in binary: "
  0 7 do main.a 1 i lshift / 1 and 0 .r -1 +loop
  cr ." Bits set in 255: " 255 popcount 0 .r cr ;

main
