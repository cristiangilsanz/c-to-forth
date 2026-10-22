(defun main ()
  (loop for i from 1 to 15 do
    (if (and (= (rem i 3) 0) (= (rem i 5) 0))
        (format t "FizzBuzz~%")
        (if (= (rem i 3) 0)
            (format t "Fizz~%")
            (if (= (rem i 5) 0)
                (format t "Buzz~%")
                (format t "~d~%" i))))))

(main)
