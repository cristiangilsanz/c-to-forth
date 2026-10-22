create composite 50 cells allot
composite 50 cells erase

0 value main.i
0 value main.j
: main
  0 to main.i
  0 to main.j
  2 to main.i
  begin main.i main.i * 50 < while
    composite main.i cells + @ 0 = if
      main.i main.i * to main.j
      begin main.j 50 < while
        1 composite main.j cells + !
        main.j main.i + to main.j
      repeat
    then
    main.i 1+ to main.i
  repeat
  ." Primes below 50:"
  50 2 ?do composite i cells + @ 0 = if ."  " i 0 .r then loop
  cr ;

main
