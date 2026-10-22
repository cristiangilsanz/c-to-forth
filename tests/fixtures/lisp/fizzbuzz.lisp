(defun fizzbuzz (n)
  (cond ((zerop (mod n 15)) (format t "FizzBuzz~%"))
        ((zerop (mod n 3)) (format t "Fizz~%"))
        ((zerop (mod n 5)) (format t "Buzz~%"))
        (t (format t "~d~%" n))))

(loop for i from 1 to 15 do (fizzbuzz i))
