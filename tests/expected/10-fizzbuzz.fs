: rem >r s>d r> sm/rem drop ;

: main
  16 1 ?do
    i 3 rem 0 = i 5 rem 0 = and if
      ." FizzBuzz" cr
    else
      i 3 rem 0 = if
        ." Fizz" cr
      else
        i 5 rem 0 = if ." Buzz" cr else i 0 .r cr then
      then
    then
  loop ;

main
