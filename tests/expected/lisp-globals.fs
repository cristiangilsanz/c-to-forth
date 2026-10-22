5 constant +size+
0 value *total*
create *weights* 3 , 1 , 4 , 1 , 5 ,

: add-all
  +size+ 0 max 0 ?do
    *total* *weights* i cells + @ + to *total*
  loop ;

:noname
  add-all
  ." Total: " *total* 0 .r cr
  *total* 2 * to *total*
  ." Doubled: " *total* 0 .r cr
  10 *weights* 0 cells + !
  ." First weight: " *weights* 0 cells + @ 0 .r ." , size " 5 0 .r cr
; execute
