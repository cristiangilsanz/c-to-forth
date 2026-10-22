(defun factorial (n)
  (when (<= n 1) (return-from factorial 1))
  (* n (factorial (- n 1))))

(defun main ()
  (loop for n from 1 to 10 do
    (format t "~d! = ~d~%" n (factorial n))))

(main)
