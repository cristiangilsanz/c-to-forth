0 value fizzbuzz.n
: fizzbuzz
  to fizzbuzz.n
  fizzbuzz.n 15 mod 0= if
    ." FizzBuzz" cr
  else
    fizzbuzz.n 3 mod 0= if
      ." Fizz" cr
    else
      fizzbuzz.n 5 mod 0= if
        ." Buzz" cr
      else
        fizzbuzz.n 0 .r cr
      then
    then
  then ;

:noname
  16 1 ?do i fizzbuzz loop
; execute
